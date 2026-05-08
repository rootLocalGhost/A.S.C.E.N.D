// build-installer.js
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const { version } = packageJson;
const isWindows = process.platform === "win32";

if (!version) {
  console.error("Version could not be found in package.json");
  process.exit(1);
}

console.log(`--- Starting A.S.C.E.N.D. build process for v${version} ---`);

const releaseDir = "release";
const distDir = "dist";
const setupScriptPath = "setup.iss";
const appName = "A.S.C.E.N.D.exe";

const ISCC_PATH = "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe";

try {
  console.log("[1/5] Terminating any running application instances...");
  if (isWindows) {
    try {
      execSync(`taskkill /f /im ${appName}`, { stdio: "ignore" });
      console.log("... Closed existing application process.");
    } catch (e) {
      console.log("... No running application instance found.");
    }
  } else {
    console.log("... Skipped on non-Windows platform.");
  }

  console.log("[2/5] Cleaning up previous builds...");
  if (fs.existsSync(distDir))
    fs.rmSync(distDir, { recursive: true, force: true });
  if (fs.existsSync(releaseDir))
    fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  console.log("[3/5] Building application with electron-builder...");
  execSync("npx electron-builder --dir", { stdio: "inherit" });

  if (isWindows) {
    console.log("[4/5] Creating Windows installer with Inno Setup...");
    if (!fs.existsSync(ISCC_PATH)) {
      throw new Error(
        `Inno Setup Compiler not found at: ${ISCC_PATH}\nPlease update the ISCC_PATH in build-installer.js or install Inno Setup to that location.`
      );
    }
    execSync(`"${ISCC_PATH}" /DAppVersion=${version} "${setupScriptPath}"`, {
      stdio: "inherit",
    });
  } else {
    console.log("[4/5] Skipping Inno Setup installer creation on non-Windows.");
  }

  console.log("[5/5] Finalizing and cleaning up...");
  if (fs.existsSync(distDir))
    fs.rmSync(distDir, { recursive: true, force: true });

  console.log("--- Build process completed successfully! ---");
  console.log(
    isWindows
      ? `Installer created in ./${releaseDir}/`
      : `Build output prepared in ./${releaseDir}/ (installer step skipped on non-Windows).`
  );
} catch (error) {
  console.error("\n--- BUILD FAILED ---");
  console.error(error.message);
  process.exit(1);
}
