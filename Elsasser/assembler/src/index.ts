import {Command} from "commander"
import {version} from "../package.json"
import * as file from "./file";
import * as list from "./list";

// ********************************************************************
// Entry Point
// ********************************************************************
const program = new Command();
program.version(version);

// Single file command
program
	.description("MIDI file -> CSV file")
	.command("file")
	.argument("<pathMIDI>", "Path to the source MIDI file")
	.argument("<pathCSV>", "Path to the target output file")
	.action(async (pathMIDI: string, pathCSV: string): Promise<void> => {
		return file.execute(pathMIDI, pathCSV);
	});

// CSV file list of files
program
	.description("CSV manifest -> CSV files")
	.command("list")
	.argument("<pathCSV>", "Path to the source manifest file")
	.action(async (pathCSV: string): Promise<void> => {
		return list.execute(pathCSV);
	});

program.parseAsync(process.argv)
	.then(() => {
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
