import {writeToPath} from "fast-csv";
import * as path from "node:path";
import {readCsvFile} from "./csv";
import * as file from "./file";
import {CsvFile} from "./types";
import {getAsapRoot} from "./utils";

// ********************************************************************
// Exported API
// ********************************************************************
export async function execute(pathCSV: string): Promise<void> {
	const list = await getMidiFileList(pathCSV);
	await processMidiFileList(list);
	await updateMidiFileList(pathCSV);
}

// ********************************************************************
// Internal API
// ********************************************************************
async function getMidiFileList(pathCSV: string): Promise<string[]> {
	const csvData: CsvFile = await readCsvFile(pathCSV);
	return csvData.data.reduce((list, line): string[] => {
		list.push(line["midi_performance"])
		if (list.indexOf(line["midi_score"]) < 0) {
			list.push(line["midi_score"])
		}
		return list;
	}, []);
}

async function updateMidiFileList(pathCSV: string): Promise<void> {
	const csvData: CsvFile = await readCsvFile(pathCSV);
	csvData.data.forEach((line) => {
		line.csv_score = line.midi_score.replace(/\.mid$/, ".csv");
		line.csv_performance = line.midi_performance.replace(/\.mid$/, ".csv");
	});
	csvData.header = [...csvData.header, "csv_score", "csv_performance"];
	return new Promise((resolve, reject) => {
		writeToPath(pathCSV, csvData.data, {headers: csvData.header})
			.on("finish", resolve)
			.on("error", (error) => {
				reject(new Error(`Error writing ${path}: ${error}`));
			});
	})
}

async function processMidiFileList(list: string[]): Promise<void> {
	const asapRoot = getAsapRoot();
	for (const pathMidiRelative of list) {
		const pathMidiFull = path.join(asapRoot, pathMidiRelative);
		const pathCsvFull = pathMidiFull.replace(/\.mid$/, ".csv");
		console.log(`processing: ${pathMidiFull} -> ${pathCsvFull}`);
		await file.execute(pathMidiFull, pathCsvFull);
	}
}

