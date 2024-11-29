import {
	format,
	FormatterRow
} from "fast-csv"
import {
	MidiIoEvent,
	MidiIoEventSubtype,
	MidiIoEventType,
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
			writeCSV(pathCSV, rect)
				.then(resolve)
				.catch(reject);
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

/**
 * I want to make sure there always is a time-signature, key-signature and tempo
 * Nothing fancy, if they aren't at tickOffset = 0, we will add them.
 * Note: the order does not matter here. We have not sorted them yet.
 * @param track
 */
function normalizeTrack(track: MidiIoTrackAbs): MidiIoTrackAbs {
	const timeSignatures = track.filter((e) => {
		return e.subtype === MidiIoEventSubtype.TimeSignature && e.tickOffset === 0;
	});
	const keySignatures = track.filter((e) => {
		return e.subtype === MidiIoEventSubtype.KeySignature && e.tickOffset === 0;
	});
	const tempos = track.filter((e) => {
		return e.subtype === MidiIoEventSubtype.SetTempo && e.tickOffset === 0;
	});
	if (timeSignatures.length === 0) {
		track.push({
			denominator: 4,
			numerator: 4,
			subtype: MidiIoEventSubtype.TimeSignature,
			tickLength: 0,
			tickOffset: 0,
			deltaTime: 0,
			type: MidiIoEventType.Meta
		});
	} else if (timeSignatures.length > 1) {
		console.warn(`multiple time signatures found: ${JSON.stringify(timeSignatures)})`);
		for (let i = 0; i < timeSignatures.length - 1; i++) {
			track.splice(track.indexOf(timeSignatures[i]), 1);
		}
	}
	if (keySignatures.length === 0) {
		track.push({
			key: 0,
			scale: 0,
			subtype: MidiIoEventSubtype.KeySignature,
			tickLength: 0,
			tickOffset: 0,
			deltaTime: 0,
			type: MidiIoEventType.Meta
		});
	} else if (keySignatures.length > 1) {
		console.warn(`multiple key signatures found: ${JSON.stringify(keySignatures)}`);
		for (let i = 0; i < keySignatures.length - 1; i++) {
			track.splice(track.indexOf(keySignatures[i]), 1);
		}
	}
	if (tempos.length === 0) {
		track.push({
			microsecondsPerBeat: 500000,
			subtype: MidiIoEventSubtype.SetTempo,
			tickLength: 0,
			tickOffset: 0,
			deltaTime: 0,
			type: MidiIoEventType.Meta
		});
	} else if (tempos.length > 1) {
		console.warn(`multiple tempo signatures found: ${JSON.stringify(tempos)}`);
		for (let i = 0; i < tempos.length - 1; i++) {
			track.splice(track.indexOf(tempos[i]), 1);
		}
	}
	return track;
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
			} else if (event.subtype === MidiIoEventSubtype.EndOfTrack) {
				queue.forEach((e) => {
					e.tickLength = tickOffset - e.tickOffset;
				})
			}
		});
		return record;
	});
}

function rectanglify(midi: MidiIoSong): any[] {
	const preprocessed = preprocessTracks(midi.tracks);
	const merged = mergeTracks(preprocessed);
	const normalized = normalizeTrack(merged);
	const sorted = sortTrack(normalized);
	return sorted.map(event => {
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

function sortTrack(track: MidiIoTrackAbs): MidiIoTrackAbs {
	return track.sort((a: MidiIoEventAbs, b: MidiIoEventAbs): number => {
		if (a.tickOffset !== b.tickOffset) {
			return a.tickOffset - b.tickOffset
		} else {
			return sortMap.get(a.subtype) - sortMap.get(b.subtype);
		}
	});
}


async function writeCSV(path: string, rect: FormatterRow): Promise<void> {
	return new Promise((resolve, reject) => {
		const streamFile = createWriteStream(path)
			.on("finish", resolve)
			.on("error", (error) => {
				reject(new Error(`Error writing ${path}: ${error}`));
			});
		let streamCsv = format({
			headers: ["type", "tickOffset", "tickLength", "value"],
			quoteColumns: [false, false, false, false]
		});
		streamCsv.pipe(streamFile);
		rect.forEach((row: FormatterRow) => streamCsv.write(row));
		streamCsv.end();
	})
}
