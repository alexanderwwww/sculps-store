import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Face } from '../types'

const PANE = 'aquarius'
const face = atom({ plugin: 'aquarius', key: 'face' } as const, 'happy' as Face)
const isOn = atom({ plugin: 'aquarius', key: 'isOn' } as const, true)
const line = atom({ plugin: 'aquarius', key: 'line' } as const, 'Your wish, boss. What are we making today?')
const whips = atom({ plugin: 'aquarius', key: 'whips' } as const, 0)

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
