#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import { isBinaryFile } from "isbinaryfile";
import { next as Automerge, Text } from "@automerge/automerge";

interface FileInfo {
  path: string;
  content?: string;
}

async function listFilesRecursively(dir: string): FileInfo[] {
  let results: FileInfo[] = [];

  // Read directory contents
  const items = fs.readdirSync(dir);

  for (const item of items) {
    // Skip directories that start with . or target folder
    if (item.startsWith(".") || item === "target" || item === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // If directory, recursively list its contents
      results = results.concat(await listFilesRecursively(fullPath));
    } else {
      // Import istextorbinary to detect file type

      // Check if file is binary
      if (!(await isBinaryFile(fullPath))) {
        const content = fs.readFileSync(fullPath, "utf8");
        results.push({ path: fullPath.replace(/\//g, ":"), content });
      } else {
        // Skip binary files
        results.push({ path: fullPath });
      }
    }
  }

  return results;
}

// Initialize Automerge repo with storage and network adapters
import { Repo } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import * as A from "@automerge/automerge";

const repo = new Repo({
  network: [new BrowserWebSocketClientAdapter("wss://sync.automerge.org")],
  enableRemoteHeadsGossiping: true,
});

const currentDir = process.cwd();
const files = await listFilesRecursively(currentDir);

const handle = repo.create<any>();

const numChangedFiles = 1000;
const numInserts = 100;

handle.change((doc) => {
  for (const file of files) {
    if (file.content) {
      doc[file.path] = file.content;
    } else {
      doc[file.path] = { binary: true };
    }
  }
});

const textFiles = files.filter((f) => f.content);

if (textFiles.length > 0) {
  handle.change((doc) => {
    for (let i = 0; i < numChangedFiles; i++) {
      // Pick a random file with content
      const randomFile =
        textFiles[Math.floor(Math.random() * textFiles.length)];
      const content = randomFile.content;

      console.log(`Modifying file: ${randomFile.path}`);

      let modifiedContent = content ?? "";

      // Insert "foo" at random positions in the text
      for (let j = 0; j < numInserts; j++) {
        const position = Math.floor(Math.random() * modifiedContent.length);
        modifiedContent =
          modifiedContent.slice(0, position) +
          "foo" +
          modifiedContent.slice(position);
      }

      try {
        Automerge.updateText(doc, [randomFile.path], modifiedContent);
      } catch (err) {
        console.error("failed", randomFile.path, doc[randomFile.path]);
      }
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
}

handle.on("remote-heads", ({ storageId, heads }) => {
  if (Automerge.equals(handle.heads(), heads)) {
    console.log("done sync");
  }
});

console.log("Simulation parameters:");
console.log(`Number of files to modify: ${numChangedFiles}`);
console.log(`Number of inserts per file: ${numInserts}`);

console.log(handle.url);
