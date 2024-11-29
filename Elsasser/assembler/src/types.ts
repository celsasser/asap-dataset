import {MidiIoEvent} from "midi-file-io";

export interface CsvFile {
    data: { [key: string]: string }[];
    header: string[];
    path: string;
}

export interface MidiIoEventAbs extends MidiIoEvent {
    tickOffset: number;
    tickLength: number;
}

export type MidiIoTrackAbs = MidiIoEventAbs[];