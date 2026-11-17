import * as readline from "node:readline/promises";

export interface SelectChoice<T extends string> {
  label: string;
  value: T;
}

export interface Prompter {
  text(
    question: string,
    options?: { default?: string; validate?: (value: string) => string | null },
  ): Promise<string>;
  secret(question: string): Promise<string>;
  confirm(question: string, defaultValue?: boolean): Promise<boolean>;
  select<T extends string>(
    question: string,
    choices: SelectChoice<T>[],
    defaultValue?: T,
  ): Promise<T>;
  info(message: string): void;
  close(): void;
}

/** Used when stdin is not a TTY (scripts, CI): returns defaults, never blocks. */
export class DefaultPrompter implements Prompter {
  text(_question: string, options?: { default?: string }): Promise<string> {
    return Promise.resolve(options?.default ?? "");
  }
  secret(): Promise<string> {
    return Promise.resolve("");
  }
  confirm(_question: string, defaultValue = false): Promise<boolean> {
    return Promise.resolve(defaultValue);
  }
  select<T extends string>(
    _question: string,
    choices: SelectChoice<T>[],
    defaultValue?: T,
  ): Promise<T> {
    return Promise.resolve(defaultValue ?? choices[0]!.value);
  }
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  }
  close(): void {}
}

export class ReadlinePrompter implements Prompter {
  private readonly interactive: boolean;

  constructor(
    private readonly input: NodeJS.ReadStream = process.stdin,
    private readonly output: NodeJS.WriteStream = process.stdout,
  ) {
    this.interactive = Boolean(input.isTTY);
  }

  private async ask(question: string): Promise<string> {
    const rl = readline.createInterface({ input: this.input, output: this.output });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  }

  async text(
    question: string,
    options: { default?: string; validate?: (value: string) => string | null } = {},
  ): Promise<string> {
    if (!this.interactive) return options.default ?? "";
    for (;;) {
      const suffix = options.default != null ? ` [${options.default}]` : "";
      const answer = (await this.ask(`${question}${suffix} `)).trim();
      const value = answer === "" ? (options.default ?? "") : answer;
      const error = options.validate?.(value) ?? null;
      if (error) {
        this.output.write(`${error}\n`);
        continue;
      }
      return value;
    }
  }

  async secret(question: string): Promise<string> {
    if (!this.interactive) return "";
    return this.askMasked(question);
  }

  private askMasked(question: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stdin = this.input;
      this.output.write(`${question} `);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      let value = "";

      const cleanup = () => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
      };

      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === "\r" || char === "\n" || char === "\u0004") {
            cleanup();
            this.output.write("\n");
            resolve(value);
            return;
          }
          if (char === "\u0003") {
            cleanup();
            this.output.write("\n");
            reject(new Error("cancelled"));
            return;
          }
          if (char === "\u007f" || char === "\b") {
            if (value.length > 0) {
              value = value.slice(0, -1);
              this.output.write("\b \b");
            }
            continue;
          }
          value += char;
          this.output.write("*");
        }
      };

      stdin.on("data", onData);
    });
  }

  async confirm(question: string, defaultValue = false): Promise<boolean> {
    if (!this.interactive) return defaultValue;
    const hint = defaultValue ? "(Y/n)" : "(y/N)";
    for (;;) {
      const answer = (await this.ask(`${question} ${hint} `)).trim().toLowerCase();
      if (answer === "") return defaultValue;
      if (answer === "y" || answer === "yes") return true;
      if (answer === "n" || answer === "no") return false;
      this.output.write("Please answer y or n.\n");
    }
  }

  async select<T extends string>(
    question: string,
    choices: SelectChoice<T>[],
    defaultValue?: T,
  ): Promise<T> {
    if (!this.interactive) return defaultValue ?? choices[0]!.value;
    const defaultIndex = Math.max(
      0,
      choices.findIndex((c) => c.value === (defaultValue ?? choices[0]!.value)),
    );
    for (;;) {
      this.output.write(`${question}\n`);
      choices.forEach((choice, index) => {
        const mark = index === defaultIndex ? "*" : " ";
        this.output.write(`  ${mark} ${index + 1}) ${choice.label}\n`);
      });
      const answer = (
        await this.ask(`Choose 1-${choices.length} [${defaultIndex + 1}] `)
      ).trim();
      if (answer === "") return choices[defaultIndex]!.value;
      const index = Number.parseInt(answer, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < choices.length) {
        return choices[index]!.value;
      }
      this.output.write("Enter one of the listed numbers.\n");
    }
  }

  info(message: string): void {
    this.output.write(`${message}\n`);
  }

  close(): void {}
}