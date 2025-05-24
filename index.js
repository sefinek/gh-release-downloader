require('dotenv').config();
const axios = require('axios');
const kleur = require('kleur');
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');

const now = () => kleur.gray(`[${new Date().toISOString()}]`);
const log = {
	info: msg => console.log(`${now()} ${kleur.blue('[INFO]')} ${msg}`),
	success: msg => console.log(`${now()} ${kleur.green('[ OK ]')} ${msg}`),
	skip: msg => console.log(`${now()} ${kleur.yellow('[SKIP]')} ${msg}`),
	error: msg => console.error(`${now()} ${kleur.red('[ERR ]')} ${msg}`),
};

const { OWNER, REPO_NAME, DEST } = process.env;
if (!OWNER || !REPO_NAME || !DEST) {
	log.error('.env is missing OWNER, REPO or DEST');
	process.exit(1);
}

const API = `https://api.github.com/repos/${OWNER}/${REPO_NAME}/releases`;

const download = async (url, destPath) => {
	log.info(`Downloading: ${url}`);
	const res = await axios.get(url, { responseType: 'stream' });
	await pipeline(res.data, createWriteStream(destPath));
	log.success(`Saved: ${destPath}`);
};

const processRelease = async ({ tag_name, name: releaseName, body, assets, zipball_url }) => {
	const releaseDir = path.join(DEST, tag_name);

	try {
		await fs.access(releaseDir);
		log.skip(`${tag_name} already exists`);
		return;
	} catch {}

	log.info(`Processing release: ${tag_name}`);
	await fs.mkdir(releaseDir, { recursive: true });

	for (const { name: assetName, browser_download_url } of assets) {
		const dest = path.join(releaseDir, assetName);
		await download(browser_download_url, dest);
	}

	const zipPath = path.join(releaseDir, 'source_code.zip');
	await download(zipball_url, zipPath);

	const readmePath = path.join(releaseDir, 'README.md');
	const content = `# ${releaseName || tag_name}\n\n${body || ''}`;
	await fs.writeFile(readmePath, content);
	log.success(`README.md written for ${tag_name}`);
};

const main = async () => {
	log.info('Fetching release data...');
	try {
		const { data: releases } = await axios.get(API);
		for (const release of releases) await processRelease(release);
		log.success('All releases processed.');
	} catch (err) {
		log.error(`Failed to fetch releases: ${err.message}`);
	}
};

(async () => main())();