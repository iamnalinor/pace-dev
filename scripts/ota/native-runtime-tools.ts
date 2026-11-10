export type RuntimeCommand = {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
};
export type RuntimeCollectorPorts = {
  readonly bunVersion: string;
  readonly run: (
    command: RuntimeCommand,
  ) => Promise<{ readonly exitCode: number; readonly stdout: string }>;
  readonly read: (path: string) => Promise<Uint8Array>;
};

/** Invoke installed Node-shebang CLIs directly, never force them to execute under Bun. */
export const runtimeCollectorPorts: RuntimeCollectorPorts = {
  bunVersion: Bun.version,
  run: async (command) => {
    const child = Bun.spawn([command.executable, ...command.args], {
      cwd: command.cwd,
      env: { ...command.environment },
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = new Response(child.stdout).text();
    const [exitCode, stdout] = await Promise.all([child.exited, output]);
    return { exitCode, stdout };
  },
  read: async (filePath) => new Uint8Array(await Bun.file(filePath).arrayBuffer()),
};
