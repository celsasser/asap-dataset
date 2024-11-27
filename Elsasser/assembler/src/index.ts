import {Command} from 'commander'
import {format, FormatterRow} from 'fast-csv'
import {MidiIoEvent, MidiIoEventSubtype, MidiIoSong, MidiIoTrack, parseMidiFile} from 'midi-file-io'
import {createWriteStream} from "node:fs";
import {version} from '../package.json'
import {MidiIoEventAbs, MidiIoTrackAbs} from "./types";

const sortMap = new Map<MidiIoEventSubtype, Number>();
sortMap.set(MidiIoEventSubtype.KeySignature, 1);
sortMap.set(MidiIoEventSubtype.TimeSignature, 2);
sortMap.set(MidiIoEventSubtype.SetTempo, 3);
sortMap.set(MidiIoEventSubtype.NoteOn, 4);


// ********************************************************************
// Public API
// ********************************************************************
export function run(): void {
    const program = new Command();
    program
        .version(version)
        .description("MIDI file -> CSV file")
        .argument("<pathMIDI>", "Path to MIDI file")
        .argument("<pathCSV>", "Path to CSV file")
        .action((pathMIDI, pathCSV) => {
            const midi = parseMidiFile(pathMIDI);
            const rect = rectanglify(midi);
            writeCSV(pathCSV, rect);
        });
}

// ********************************************************************
// Private API
// ********************************************************************
function formatNoteValue(event: MidiIoEventAbs): string {
    return `${event.noteNumber}:${event.velocity}`
}

function formatKeySignatureValue(event: MidiIoEventAbs): string {
    const scale = (event.scale === 0) ? "Major" : "Minor";
    switch(event.key) {
        case -7:    return `Cb ${scale}`;
        case -6:    return `Gb ${scale}`;
        case -5:    return `Db ${scale}`;
        case -4:    return `Ab ${scale}`;
        case -3:    return `Eb ${scale}`;
        case -2:    return `Bb ${scale}`;
        case -1:    return `F ${scale}`;
        case 0:    return `C ${scale}`;
        case 1:    return `G ${scale}`;
        case 2:    return `D ${scale}`;
        case 3:    return `A ${scale}`;
        case 4:    return `E ${scale}`;
        case 5:    return `B ${scale}`;
        case 6:    return `F# ${scale}`;
        case 7:    return `C# ${scale}`;
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
    return track.sort((a: MidiIoEventAbs, b: MidiIoEventAbs): Number => {
        if(a.tickOffset !== b.tickOffset) {
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
        track.forEach(function(event: MidiIoEvent): void {
            tickOffset += event.deltaTime;
            // filter on the ones we care about
            if(event.subtype === MidiIoEventSubtype.NoteOn
                || event.subtype === MidiIoEventSubtype.SetTempo
                || event.subtype === MidiIoEventSubtype.KeySignature
                || event.subtype === MidiIoEventSubtype.TimeSignature
            ) {
                const eventAbs = {
                    tickOffset,
                    ...event
                };
                record.push(eventAbs);
                if(event.subtype === MidiIoEventSubtype.NoteOn) {
                    queue.push(eventAbs);
                }
            } else if(event.subtype === MidiIoEventSubtype.NoteOff) {
                // look for first match in our queue and update
                const noteOnEvent = queue.find((e) =>
                    e.subtype === MidiIoEventSubtype.NoteOn && e.noteNumber === event.noteNumber
                );
                if (noteOnEvent) {
                    noteOnEvent.tickLength = tickOffset - noteOnEvent.tickOffset;
                } else {
                    console.warn(`note off missing partner: ${event}`);
                }
            }
        });
        return record;
    }, []);
}

function rectanglify(midi: MidiIoSong): any[] {
    const preprocessed = preprocessTracks(midi.tracks);
    const merged = mergeTracks(preprocessed);
    return merged.map(event => {
        if(event.subtype === MidiIoEventSubtype.NoteOn) {
            return [
                event.subtype,
                event.tickOffset,
                event.tickLength,
                formatNoteValue(event),
            ];
        } else if(event.subtype === MidiIoEventSubtype.SetTempo) {
            return [
                event.subtype,
                event.tickOffset,
                0,
                formatTempoValue(event),
            ];
        } else if(event.subtype === MidiIoEventSubtype.KeySignature) {
            return [
                event.subtype,
                event.tickOffset,
                0,
                formatKeySignatureValue(event),
            ];
        } else {
            return [
                event.subtype,
                event.tickOffset,
                0,
                formatTimeSignatureValue(event),
            ]
        }
    });
}

function writeCSV(path: string, rect: FormatterRow): void {
    let streamCsv = format({
        headers: true
    });
    const streamFile = createWriteStream(path);
    try {
        streamCsv.pipe(streamFile);
        // write the heading
        streamCsv.write(["type", "tickOffset", "tickLength", "value"]);
        // write the bits and bobs
        rect.forEach(streamCsv.write);
        streamCsv.end();
        streamFile.close();
    } catch (e) {
        console.error(`Error writing CSV file: ${e}`);
        streamFile.close();
    }
}

