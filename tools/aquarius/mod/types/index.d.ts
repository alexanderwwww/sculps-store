export type Face = 'happy' | 'focused' | 'smug' | 'sleep'
declare module 'claude-code' {
  interface PluginState {
    aquarius: { face: Face; isOn: boolean; line: string; whips: number; isCeo: boolean; runs: { hour: number; n: number }; nextAt: number }
  }
}
