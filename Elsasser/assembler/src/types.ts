import {MidiIoEvent} from "midi-file-io";

export interface MidiIoEventAbs extends MidiIoEvent {
    tickOffset: number;
    tickLength?: number;
}

export type MidiIoTrackAbs = MidiIoEventAbs[];