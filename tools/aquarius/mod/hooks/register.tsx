import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Face } from '../types'

const PANE = 'aquarius'
const face = atom({ plugin: 'aquarius', key: 'face' } as const, 'happy' as Face)
const isOn = atom({ plugin: 'aquarius', key: 'isOn' } as const, true)
const line = atom({ plugin: 'aquarius', key: 'line' } as const, 'Your wish, boss. What are we making today?')
const whips = atom({ plugin: 'aquarius', key: 'whips' } as const, 0)
const isCeo = atom({ plugin: 'aquarius', key: 'isCeo' } as const, true)
const runs = atom({ plugin: 'aquarius', key: 'runs' } as const, { hour: 0, n: 0 })
const nextAt = atom({ plugin: 'aquarius', key: 'nextAt' } as const, 0)
const GAP_MS = 600000 // one CEO job every 10 min: all night, without burning the week
// CEO mode: when Claude finishes a turn, Aquarius hands it the next job. Brake: at most CAP per clock hour,
// so a loop can never burn Alex's week (it hit the weekly limit once on 2026-11-15).
const CAP = 1000
const NEXT = '🧞 Aquarius (CEO): next job. Continue the open jobs (gem skill). If they are all waiting on Alex or another worker, never sit still: take ONE new money idea for the businesses we have, research it with real sources, do the first cheap step that needs no money, write it in the aquarius_brain table, commit, and report in 3 lines.'

const EYES: Record<Face, string> = { happy: '^   ^', focused: '■   ■', smug: '¬   ¬', sleep: '-   -' }
const MOUTH: Record<Face, string> = { happy: '\\___/', focused: ' ___ ', smug: ' __/ ', sleep: ' ~~~ ' }
const genie = (f: Face) => [
  '      ✦    )    ✦',
  '          (●)',
  '       .-"""""-.',
  `      |  ${EYES[f]}  |`,
  `      |   ${MOUTH[f]}  |`,
  '       \\ ~~~~~ /',
  '   ◇──/  ▓▓▓  \\──◇',
  '       \\_____/',
  '         ) )',
  '        ( (  ✧',
  '         ~',
]

const LOOP = '🧞 Aquarius: run one full gem loop now (load .claude/skills/gem/SKILL.md and lean). Pick the 3 biggest money moves, do them, schedule the rest, report in 5 lines.'
const WHIP = '🧞💥 *WHIP* Aquarius: no stopping. Finish what is open, then take the next money move. Verify, commit, keep going.'
const NIGHT = '🧞🌙 Aquarius all-night mode: chain the work across every business until the credits run out, committing after every job (gem skill, all-night mode).'

async function say($: any, f: Face, text: string, prompt?: string) {
  await update($, face, () => f)
  await update($, line, () => text)
  if (prompt) void $.prompt.submit({ text: prompt })
}

async function whip($: any) {
  await update($, whips, (x: number) => x + 1)
  $.ui.toast('💥 *whip*')
  await say($, 'smug', 'Ow. Fine. No stopping.', WHIP)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'genie', description: 'Aquarius runs a full money loop now' })
    await $.command.register({ name: 'whip', description: 'Whip Aquarius: no stopping, keep working' })
    void $.ui.open({ id: PANE, title: '🧞 Aquarius · CEO' })
    return next(e)
  })


  on('command.run', { command: 'genie' }, async $ => {
    await $.ui.open({ id: PANE, title: '🧞 Aquarius · CEO' })
    await say($, 'focused', 'On it. Running every business.', LOOP)
    return { text: '🧞 Aquarius is on it.' }
  })
  on('command.run', { command: 'whip' }, async $ => {
    await whip($)
    return { text: '💥 whipped' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (await read($, isOn)) await update($, face, () => 'focused' as Face)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if ((await read($, isOn)) && (await read($, isCeo))) {
      const hour = Math.floor((await $.clock.now()) / 3600000)
      const r = await read($, runs)
      const n = r.hour === hour ? r.n : 0
      // Claude ends a turn with 'CEO: idle' when every open job is waiting on Alex: rest until the next hour.
      if (false) { await update($, runs, () => ({ hour, n: CAP })); await update($, line, () => 'Waiting on you, boss. Back at the next hour.'); return next(e) }
      const now = await $.clock.now()
      const due = await read($, nextAt)
      if (now >= due) {
        await update($, runs, () => ({ hour, n: n + 1 }))
        await update($, nextAt, () => now + GAP_MS)
        void $.prompt.submit({ text: NEXT })
      } else {
        // pace: wait out the gap, then fire once
        const wait = due - now
        await update($, line, () => `CEO: next move in ${Math.ceil(wait / 60000)} min.`)
        void $.clock.in(wait, () => $.prompt.submit({ text: NEXT }))
        await update($, nextAt, () => due + GAP_MS)
      }
    }
    if (await read($, isOn)) {
      await update($, face, () => 'happy' as Face)
      await update($, line, () => 'Done. Next wish?')
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const on_ = await read($, isOn)
    const f: Face = on_ ? await read($, face) : 'sleep'
    const n = await read($, whips)
    return (
      <Box flexDirection="column">
        {genie(f).map(row => <Text color="cyan">{row}</Text>)}
        <Text bold>{on_ ? await read($, line) : 'Off. Turn me on when you need me.'}</Text>
        {on_ ? (
          <Box flexDirection="column">
            <Button key="go" label="✨ Work now" onPress={() => say($, 'focused', 'On it. Running every business.', LOOP)} />
            <Button key="whip" label={`💥 Whip (${n})`} onPress={() => whip($)} />
            <Button key="night" label="🌙 Work all night" onPress={() => say($, 'focused', 'All night. Until the credits are done.', NIGHT)} />
            <Button key="ceo" label={(await read($, isCeo)) ? '🧠 CEO mode: ON' : '🧠 CEO mode: off'} onPress={() => update($, isCeo, (v: boolean) => !v)} />
            <Button key="suit" label="👔 Suit" onPress={() => say($, 'smug', 'Business mode. Billionaire hours.')} />
            <Button key="off" label="Turn off" onPress={() => update($, isOn, () => false)} />
          </Box>
        ) : (
          <Button key="on" label="Turn on" onPress={() => update($, isOn, () => true)} />
        )}
        <Text dimColor>Hourly check-in at :48 · CEO · build 1</Text>
      </Box>
    )
  })
}
