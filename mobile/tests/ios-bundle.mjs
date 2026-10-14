// Runs on the CI-built app, catching wrong-environment archives and resources
// that exist in the checkout but were not actually bundled by Xcode.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const [bundle, configuration] = process.argv.slice(2);
assert.ok(['Staging', 'Release'].includes(configuration));
const staging = configuration === 'Staging';
const host = staging ? 'staging.fearville.app' : 'fearville.app';
const identifier = staging ? 'app.fearville.staging' : 'app.fearville';
const plist = JSON.parse(
  execFileSync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', join(bundle, 'Info.plist')],
    { encoding: 'utf8' },
  ),
);
const config = JSON.parse(
  readFileSync(join(bundle, 'capacitor.config.json'), 'utf8'),
);
assert.equal(plist.CFBundleIdentifier, identifier);
assert.equal(plist.CFBundleDisplayName, staging ? 'Fearville β' : 'Fearville');
assert.equal(plist.FearvilleSiteURL, `https://${host}`);
assert.deepEqual(plist.UIDeviceFamily, [1]);
assert.deepEqual(plist.UISupportedInterfaceOrientations, [
  'UIInterfaceOrientationPortrait',
]);
assert.equal(plist.MinimumOSVersion, '17.0');
assert.equal(plist.UIUserInterfaceStyle, 'Dark');
assert.equal(config.server.url, `https://${host}`);
assert.equal(config.appId, identifier);
assert.equal(config.server.errorPath, 'error.html');
assert.equal(config.ios.webContentsDebuggingEnabled, false);
assert.equal(config.loggingBehavior, 'none');
assert.match(
  readFileSync(join(bundle, 'public/site.js'), 'utf8'),
  new RegExp(`https://${host.replaceAll('.', '\\.')}/`),
);
for (const resource of [
  'PrivacyInfo.xcprivacy',
  'MetalMania-Regular.ttf',
  'LaunchScreen.storyboardc',
  'public/error.html',
  'public/assets/MetalMania-Regular.ttf',
  'public/assets/fearville-logo.png',
]) {
  assert.ok(
    existsSync(join(bundle, resource)),
    `Missing bundled resource: ${resource}`,
  );
}
for (const plugin of [
  'AppPlugin',
  'HapticsPlugin',
  'NetworkPlugin',
  'SharePlugin',
  'KeepAwakePlugin',
]) {
  assert.ok(
    config.packageClassList.includes(plugin),
    `Missing plugin: ${plugin}`,
  );
}
console.log(`${configuration} app bundle: passed`);
