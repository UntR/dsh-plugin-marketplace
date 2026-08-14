export interface MarketplaceLogger {
  info(message: string, ...values: unknown[]): void
  warn(message: string, ...values: unknown[]): void
}

export const silentLogger: MarketplaceLogger = {
  info: () => {},
  warn: () => {},
}
