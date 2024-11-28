import {
	format,
	FormatterRow
} from "fast-csv"
import {
	MidiIoEvent,
	MidiIoEventSubtype,
	MidiIoSong,
	MidiIoTrack,
	parseMidiFile
} from "midi-file-io"
import {createWriteStream} from "node:fs";
import {
	MidiIoEventAbs,
	MidiIoTrackAbs
} from "./types";

const sortMap = new Map<MidiIoEventSubtype, number>();
sortMap.set(MidiIoEventSubtype.KeySignature, 1);
sortMap.set(MidiIoEventSubtype.TimeSignature, 2);
sortMap.set(MidiIoEventSubtype.SetTempo, 3);
sortMap.set(MidiIoEventSubtype.NoteOn, 4);


// ********************************************************************
// Exported API
// ********************************************************************
export async function execute(pathMIDI: string, pathCSV: string): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const song = parseMidiFile(pathMIDI);
			const rect = rectanglify(song);
			writeCSV(pathCSV, rect);
			resolve();
		} catch (e) {
			reject(e);
		}
	})
}

// ********************************************************************
// Internal API
// ********************************************************************
function formatNoteValue(event: MidiIoEventAbs): string {
	return `${event.noteNumber}:${event.velocity}`
}

function formatKeySignatureValue(event: MidiIoEventAbs): string {
	const scale = (event.scale === 0) ? "Major" : "Minor";
	switch (event.key) {
		case -7:
			return `Cb ${scale}`;
		case -6:
			return `Gb ${scale}`;
		case -5:
			return `Db ${scale}`;
		case -4:
			return `Ab ${scale}`;
		case -3:
			return `Eb ${scale}`;
		case -2:
			return `Bb ${scale}`;
		case -1:
			return `F ${scale}`;
		case 0:
			return `C ${scale}`;
		case 1:
			return `G ${scale}`;
		case 2:
			return `D ${scale}`;
		case 3:
			return `A ${scale}`;
		case 4:
			return `E ${scale}`;
		case 5:
			return `B ${scale}`;
		case 6:
			return `F# ${scale}`;
		case 7:
			return `C# ${scale}`;
	}
	return `Unknown ${scale}`;
}

function formatTempoValue(event: MidiIoEventAbs): string {
	// todo: check up on this guy
	return `${event.microsecondsPerBeat}`
}

function formatTimeSignatureValue(event: MidiIoEventAbs): string {
	return `${event.numerator}/${event.denominator}`
}

function mergeTracks(tracks: MidiIoTrackAbs[]): MidiIoTrackAbs {
	const track = tracks.reduce<MidiIoTrackAbs>((record, track): MidiIoTrackAbs => {
		track.forEach((event): void => {
			record.push(event);
		});
		return record;
	}, []);
	return track.sort((a: MidiIoEventAbs, b: MidiIoEventAbs): number => {
		if (a.tickOffset !== b.tickOffset) {
			return a.tickOffset - b.tickOffset
		} else {
			return sortMap.get(a.subtype) - sortMap.get(b.subtype);
		}
	});
}

function preprocessTracks(tracks: MidiIoTrack[]): MidiIoTrackAbs[] {
	return tracks.map<MidiIoTrackAbs>((track): MidiIoTrackAbs => {
		let tickOffset: number = 0;
		const queue: MidiIoTrackAbs = [];
		const record: MidiIoTrackAbs = [];
		track.forEach(function (event: MidiIoEvent): void {
			tickOffset += event.deltaTime;
			// filter on the ones we care about
			if (event.subtype === MidiIoEventSubtype.NoteOn
				|| event.subtype === MidiIoEventSubtype.SetTempo
				|| event.subtype === MidiIoEventSubtype.KeySignature
				|| event.subtype === MidiIoEventSubtype.TimeSignature
			) {
				const eventAbs = {
					tickLength: 0,
					tickOffset,
					...event
				};
				record.push(eventAbs);
				if (event.subtype === MidiIoEventSubtype.NoteOn) {
					queue.push(eventAbs);
				}
			} else if (event.subtype === MidiIoEventSubtype.NoteOff) {
				// look for the oldest (first) match in our queue and update
				const noteOnEvent = queue.find((e) =>
					e.noteNumber === event.noteNumber
				);
				if (noteOnEvent) {
					noteOnEvent.tickLength = tickOffset - noteOnEvent.tickOffset;
					queue.splice(queue.indexOf(noteOnEvent), 1);
				} else {
					console.warn(`note off missing partner: ${event}`);
				}
			} else if(event.subtype === MidiIoEventSubtype.EndOfTrack) {
				queue.forEach((e) => {
					e.tickLength = tickOffset - e.tickOffset;
				})
			}
		});
		return record;
	}, []);
}

function rectanglify(midi: MidiIoSong): any[] {
	const preprocessed = preprocessTracks(midi.tracks);
	const merged = mergeTracks(preprocessed);
	return merged.map(event => {
		if (event.subtype === MidiIoEventSubtype.NoteOn) {
			return [
				event.subtype,
				event.tickOffset,
				event.tickLength,
				formatNoteValue(event),
			];
		} else if (event.subtype === MidiIoEventSubtype.SetTempo) {
			return [
				event.subtype,
				event.tickOffset,
				event.tickLength,
				formatTempoValue(event),
			];
		} else if (event.subtype === MidiIoEventSubtype.KeySignature) {
			return [
				event.subtype,
				event.tickOffset,
				event.tickLength,
				formatKeySignatureValue(event),
			];
		} else {
			return [
				event.subtype,
				event.tickOffset,
				event.tickLength,
				formatTimeSignatureValue(event),
			]
		}
	});
}

function writeCSV(path: string, rect: FormatterRow): void {
	const streamFile = createWriteStream(path);
	let streamCsv = format({
		headers: ["type", "tickOffset", "tickLength", "value"],
		quoteColumns: [false, false, false, false]
	});
	try {
		streamCsv.pipe(streamFile);
		// write the bits and bobs
		rect.forEach((row: FormatterRow) => {
			streamCsv.write(row);
		});
		streamCsv.end();
	} catch (e) {
		throw new Error(`Error writing CSV file: ${e}`);
	} finally {
		streamFile.close();
	}
}
