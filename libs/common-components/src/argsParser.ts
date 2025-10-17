export type Option =
  | {
      type: 'string'
      default?: string | (() => string)
      validate?: (value: string) => boolean
      alias?: string | string[]
      required?: boolean
    }
  | {
      type: 'number'
      default?: number | (() => number)
      validate?: (value: number) => boolean
      alias?: string | string[]
      required?: boolean
    }
  | {
      type: 'boolean'
      alias?: string | string[]
    }

export type Options = Record<string, Option>

type OptionsResult<T extends Options> = {
  [K in keyof T]: T[K] extends { type: 'string' }
    ? string
    : T[K] extends { type: 'number' }
      ? number
      : T[K] extends { type: 'boolean' }
        ? boolean
        : never
}

type ArgsResult<T extends Options> = {
  args: string[]
  options: OptionsResult<T>
}

export class OptionsError extends Error {}
export class ParsingError extends Error {}

export function parseArguments<T extends Options>(args: string[], options: T): ArgsResult<T> {
  for (const opt of Object.values(options)) {
    if (opt.alias && typeof opt.alias === 'string') {
      if (opt.alias.length !== 1) {
        throw new OptionsError(`Alias must be a single character: ${opt.alias}`)
      }
    }
    if (opt.alias && Array.isArray(opt.alias)) {
      for (const alias of opt.alias) {
        if (alias.length !== 1) {
          throw new OptionsError(`Alias must be a single character: ${alias}`)
        }
      }
    }
  }

  const resultArgs: string[] = []
  const resultOptions: Partial<OptionsResult<T>> = {}

  let lastOption: [keyof T, T[keyof T]] | null = null

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('-')) {
      if (lastOption != null) {
        resultOptions[lastOption[0]] = getOptionValue(arg, lastOption[1])
        lastOption = null
      } else {
        resultArgs.push(arg)
      }
      continue
    }
    if (lastOption != null) {
      throw new ParsingError(`Option require an argument: ${lastOption[0].toString()}`)
    }

    const [name, option] = getOption(arg, options)
    if (name in resultOptions) {
      throw new ParsingError(`Option defined multiple times: ${String(name)}`)
    }

    if (option.type === 'boolean') {
      resultOptions[name] = true as OptionsResult<T>[typeof name]
    } else {
      lastOption = [name, option]
    }
  }

  if (lastOption != null) {
    throw new ParsingError(`Option require an argument: ${lastOption[0].toString()}`)
  }

  for (const [name, option] of Object.entries(options) as [keyof T, T[keyof T]][]) {
    if (!(name in resultOptions)) {
      if (option.type === 'boolean') {
        resultOptions[name] = false as OptionsResult<T>[typeof name]
      } else {
        if (option.default && typeof option.default === 'function') {
          resultOptions[name] = option.default() as OptionsResult<T>[typeof name]
        } else if (option.default) {
          resultOptions[name] = option.default as OptionsResult<T>[typeof name]
        }
      }
    }

    if (!(name in resultOptions)) {
      if (option.type !== 'boolean' && (option.required ?? false)) {
        throw new ParsingError(`Option ${String(name)} missing`)
      }
    }

    if (option.type !== 'boolean' && option.validate != null) {
      const value = resultOptions[name]

      if (option.type === 'string') {
        if (!option.validate(value as string)) {
          throw new ParsingError(`${String(name)} is invalid`)
        }
      }

      if (option.type === 'number') {
        if (!option.validate(value as number)) {
          throw new ParsingError(`${String(name)} is invalid`)
        }
      }
    }
  }

  return {
    args: resultArgs,
    options: resultOptions as OptionsResult<T>,
  }
}

function getOptionValue<T extends Options, K extends keyof T>(
  arg: string,
  option: T[K],
): OptionsResult<T>[K] {
  switch (option.type) {
    case 'number': {
      if (!/^\d+$/.test(arg)) {
        throw new ParsingError(`${arg} is not an integer value`)
      }
      return parseInt(arg, 10) as OptionsResult<T>[K]
    }
    case 'string': {
      return arg as OptionsResult<T>[K]
    }
  }
  throw new OptionsError(`Unknown option type: ${option.type}`)
}

function getOption<T extends Options, K extends keyof T>(arg: string, options: T): [K, T[K]] {
  if (arg.startsWith('--')) {
    const name = arg.slice(2) as K
    const option = options[name]
    if (!option) {
      throw new ParsingError(`Unknown option: ${arg}`)
    }
    return [name, option]
  }
  const name = arg.slice(1)
  const entry = Object.entries(options).find(([_, opt]) => {
    if (opt.alias) {
      if (typeof opt.alias === 'string') {
        return opt.alias === name
      }
      if (Array.isArray(opt.alias)) {
        return opt.alias.includes(name)
      }
    }
    return false
  })

  if (!entry) {
    throw new ParsingError(`Unknown option: ${arg}`)
  }

  return [entry[0] as K, entry[1] as T[K]]
}
