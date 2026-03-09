import { extractBpmFromAls } from '../../src/main/ableton/parseAlsTempo'

export async function readAbletonBpm(filePath: string): Promise<number | null> {
  return extractBpmFromAls(filePath)
}
