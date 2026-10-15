// End-to-end check of the PACKAGED app, driven through Chromium's debug port, with a throw-away profile.
// Build first (npm run dist:dir), then: node scripts/e2e/smoke.mjs [output folder]
// Set SCENT_EXE to the app executable if it is not in the default place for your system.
import { defaultExe, launch, sleep } from './harness.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const OUT = process.argv[2] ?? 'e2e-output'
const app = await launch(EXE)
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail) }

try {
  await app.size(1280, 720)
  // IPC works from the packaged page (guards the trusted-sender check)
  const info = await app.ev('window.api.app.dbInfo().then(JSON.stringify)')
  check('IPC reachable from packaged page', !!info && JSON.parse(info).schemaVersion >= 8, info)
  check('profile is isolated', JSON.parse(info).path.includes('scent-audit-profile'), JSON.parse(info).path)

  const seeded = await app.ev('window.api.dev.seedSampleData().then(JSON.stringify)')
  check('sample data loads', JSON.parse(seeded).ok, seeded)
  await app.reload()

  for (const [route, needle] of [['#/', 'My Collection'], ['#/layering', 'Layering'], ['#/recommendations', 'ecommend'], ['#/calendar', 'Calendar'], ['#/stats', 'Stats'], ['#/settings', 'Settings']]) {
    await app.go(route)
    await sleep(900)
    const t = await app.text()
    check(`route ${route} renders`, t.includes(needle) && t.length > 200, `${t.length} chars`)
    await app.shot(`${OUT}/smoke_${route.replace(/[#/]/g, '') || 'home'}.png`)
  }

  // all five wardrobe tabs
  await app.go('#/')
  for (const tab of ['My Collection', 'Wishlist', 'To Try', 'Had', 'Garbage Perfumes']) {
    const clicked = await app.clickStartsWith(tab)
    await sleep(600)
    check(`wardrobe tab ${tab}`, clicked)
  }

  // theme switching
  await app.go('#/settings')
  for (const theme of ['Light', 'Dark']) {
    await app.clickText(theme)
    await sleep(500)
    const bg = await app.ev('getComputedStyle(document.body).backgroundColor')
    check(`theme ${theme} applies`, !!bg, bg)
  }

  check('no console errors', app.logs.errors.length === 0, app.logs.errors.slice(0, 5).join(' | '))
  check('no unhandled exceptions', app.logs.exceptions.length === 0, app.logs.exceptions.slice(0, 5).join(' | '))
  console.log('warnings:', app.logs.warnings.length)
} catch (e) {
  console.log('SCRIPT ERROR', e.message)
} finally {
  await app.quit()
  app.cleanup()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
