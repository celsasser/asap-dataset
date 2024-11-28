import * as file from "./file";
import {parseFile} from "fast-csv";
import * as path from "node:path";
import {getAsapRoot} from "./utils";

// ********************************************************************
// Exported API
// ********************************************************************
export async function execute(pathCSV: string): Promise<void> {
	const list = await getMidiFileList(pathCSV);
	await processMidiFileList(list);
}

// ********************************************************************
// Internal API
// ********************************************************************
async function getMidiFileList(pathCSV: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const list: string[] = [];
		parseFile(pathCSV, {
			headers: true,
			trim: true
		})
			.on("data", (data) => {
				list.push(data["midi_performance"])
			})
			.on("end", () => {
				resolve(list);
			})
			.on("error", (error) => {
				reject(error);
			})
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

