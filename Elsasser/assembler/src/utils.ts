import * as path from "node:path";

export function getAsapRoot(): string {
	return path.resolve(__dirname, "../../../");
}