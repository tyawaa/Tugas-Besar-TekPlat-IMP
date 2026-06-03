declare module 'midtrans-client' {
  interface MidtransConfig {
    isProduction: boolean
    serverKey: string
    clientKey: string
  }

  export class Snap {
    constructor(config: MidtransConfig)
    createTransaction(parameter: Record<string, unknown>): Promise<{
      token: string
      redirect_url: string
    }>
  }

  export class CoreApi {
    constructor(config: MidtransConfig)
    transaction: {
      notification(notification: Record<string, unknown>): Promise<Record<string, unknown>>
      status(transactionId: string): Promise<Record<string, unknown>>
    }
  }

  const midtransClient: {
    Snap: typeof Snap
    CoreApi: typeof CoreApi
  }

  export default midtransClient
}
