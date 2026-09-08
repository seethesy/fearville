import { writeFileSync } from 'node:fs';
const ids = {
  project: 'A00000000000000000000001',
  root: 'A00000000000000000000002',
  sources: 'A00000000000000000000003',
  products: 'A00000000000000000000004',
  app: 'A00000000000000000000005',
  target: 'A00000000000000000000006',
  sourcePhase: 'A00000000000000000000007',
  resourcePhase: 'A00000000000000000000008',
  frameworkPhase: 'A00000000000000000000009',
  projectList: 'A00000000000000000000010',
  targetList: 'A00000000000000000000011',
  projectDebug: 'A00000000000000000000012',
  projectRelease: 'A00000000000000000000013',
  targetDebug: 'A00000000000000000000014',
  targetRelease: 'A00000000000000000000015',
};
const files = [
  ['ClocktowerTableApp.swift', 'sourcecode.swift', 'source'],
  ['Models.swift', 'sourcecode.swift', 'source'],
  ['TableStore.swift', 'sourcecode.swift', 'source'],
  ['roles.json', 'text.json', 'resource'],
  ['Assets.xcassets', 'folder.assetcatalog', 'resource'],
  ['PrivacyInfo.xcprivacy', 'text.xml', 'resource'],
  ['Info.plist', 'text.plist.xml', 'none'],
].map(([name, type, phase], i) => ({
  name,
  type,
  phase,
  ref: 'B' + String(i + 1).padStart(23, '0'),
  build: 'C' + String(i + 1).padStart(23, '0'),
}));
let objects = files
  .map(
    (f) =>
      `${f.ref} = { isa = PBXFileReference; lastKnownFileType = ${f.type}; path = "${f.name}"; sourceTree = "<group>"; };\n${f.phase === 'none' ? '' : `${f.build} = { isa = PBXBuildFile; fileRef = ${f.ref}; };`}`,
  )
  .join('\n');
objects += `\n${ids.app} = { isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = "ClocktowerTable.app"; sourceTree = BUILT_PRODUCTS_DIR; };
${ids.root} = { isa = PBXGroup; children = (${ids.sources},${ids.products}); sourceTree = "<group>"; };
${ids.sources} = { isa = PBXGroup; children = (${files.map((f) => f.ref).join(',')}); path = ClocktowerTable; sourceTree = "<group>"; };
${ids.products} = { isa = PBXGroup; children = (${ids.app}); name = Products; sourceTree = "<group>"; };
${ids.sourcePhase} = { isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (${files
  .filter((f) => f.phase === 'source')
  .map((f) => f.build)
  .join(',')}); runOnlyForDeploymentPostprocessing = 0; };
${ids.resourcePhase} = { isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (${files
  .filter((f) => f.phase === 'resource')
  .map((f) => f.build)
  .join(',')}); runOnlyForDeploymentPostprocessing = 0; };
${ids.frameworkPhase} = { isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
${ids.target} = { isa = PBXNativeTarget; buildConfigurationList = ${ids.targetList}; buildPhases = (${ids.sourcePhase},${ids.frameworkPhase},${ids.resourcePhase}); buildRules = (); dependencies = (); name = ClocktowerTable; productName = ClocktowerTable; productReference = ${ids.app}; productType = "com.apple.product-type.application"; };
${ids.project} = { isa = PBXProject; attributes = { BuildIndependentTargetsInParallel = 1; LastUpgradeCheck = 2600; TargetAttributes = { ${ids.target} = { CreatedOnToolsVersion = 26.0; ProvisioningStyle = Automatic; }; }; }; buildConfigurationList = ${ids.projectList}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en,Base); mainGroup = ${ids.root}; productRefGroup = ${ids.products}; projectDirPath = ""; projectRoot = ""; targets = (${ids.target}); };
`;
const projectSettings =
  'CLANG_ENABLE_MODULES = YES; SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SWIFT_VERSION = 5.0; ENABLE_USER_SCRIPT_SANDBOXING = YES;';
const targetSettings =
  'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; CURRENT_PROJECT_VERSION = 1; DEVELOPMENT_TEAM = ""; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = ClocktowerTable/Info.plist; MARKETING_VERSION = 0.1.0; PRODUCT_BUNDLE_IDENTIFIER = com.example.ClocktowerTable; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; SWIFT_EMIT_LOC_STRINGS = YES; TARGETED_DEVICE_FAMILY = 1;';
for (const [id, name, settings] of [
  [
    ids.projectDebug,
    'Debug',
    projectSettings +
      ' DEBUG_INFORMATION_FORMAT = dwarf; SWIFT_OPTIMIZATION_LEVEL = "-Onone";',
  ],
  [
    ids.projectRelease,
    'Release',
    projectSettings +
      ' DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; SWIFT_COMPILATION_MODE = wholemodule; SWIFT_OPTIMIZATION_LEVEL = "-O";',
  ],
  [ids.targetDebug, 'Debug', targetSettings],
  [ids.targetRelease, 'Release', targetSettings],
])
  objects += `${id} = { isa = XCBuildConfiguration; buildSettings = { ${settings} }; name = ${name}; };\n`;
objects += `${ids.projectList} = { isa = XCConfigurationList; buildConfigurations = (${ids.projectDebug},${ids.projectRelease}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };\n${ids.targetList} = { isa = XCConfigurationList; buildConfigurations = (${ids.targetDebug},${ids.targetRelease}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };`;
writeFileSync(
  'ios/ClocktowerTable.xcodeproj/project.pbxproj',
  `// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n${objects}\n}; rootObject = ${ids.project}; }\n`,
);
writeFileSync(
  'ios/ClocktowerTable.xcodeproj/xcshareddata/xcschemes/ClocktowerTable.xcscheme',
  `<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="2600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${ids.target}" BuildableName="ClocktowerTable.app" BlueprintName="ClocktowerTable" ReferencedContainer="container:ClocktowerTable.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"/><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${ids.target}" BuildableName="ClocktowerTable.app" BlueprintName="ClocktowerTable" ReferencedContainer="container:ClocktowerTable.xcodeproj"/></BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>`,
);
console.log('Generated Xcode project and shared scheme.');
