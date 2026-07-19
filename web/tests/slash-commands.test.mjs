import assert from "node:assert/strict"
import test from "node:test"

import {
  availableSlashCommands,
  filterSlashCommands,
  findSlashCommand,
  parseSlashCommand,
  slashCommandQuery,
} from "../src/lib/slash-commands.ts"

const allCapabilities = {
  compact: true,
  newSession: true,
  settings: true,
  memo: true,
  selfAwake: true,
}

test("only exposes commands supported by the current surface", () => {
  const commands = availableSlashCommands({
    compact: false,
    newSession: false,
    settings: false,
    memo: false,
    selfAwake: false,
  })

  assert.deepEqual(commands.map((command) => command.name), ["model", "permissions", "help"])
})

test("opens and filters the command menu from the first token", () => {
  const commands = availableSlashCommands(allCapabilities)

  assert.equal(slashCommandQuery("/", 1), "")
  assert.equal(slashCommandQuery("/mo", 3), "mo")
  assert.equal(slashCommandQuery("/model argument", 15), null)
  assert.equal(slashCommandQuery("plain text", 5), null)
  assert.equal(filterSlashCommands(commands, "mo")[0]?.name, "model")
  assert.equal(filterSlashCommands(commands, "权限")[0]?.name, "permissions")
})

test("parses commands while preserving explicit escape forms", () => {
  assert.deepEqual(parseSlashCommand("/model "), { name: "model", args: "" })
  assert.deepEqual(parseSlashCommand("/model gpt"), { name: "model", args: "gpt" })
  assert.equal(parseSlashCommand(" /model"), null)
  assert.equal(parseSlashCommand("//model"), null)
})

test("resolves aliases to their canonical command", () => {
  const commands = availableSlashCommands(allCapabilities)

  assert.equal(findSlashCommand(commands, "permission")?.name, "permissions")
  assert.equal(findSlashCommand(commands, "awake")?.name, "self-awake")
  assert.equal(findSlashCommand(commands, "compress")?.name, "compact")
  assert.equal(findSlashCommand(commands, "compact")?.acceptsArguments, true)
})
