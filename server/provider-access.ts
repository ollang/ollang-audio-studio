import { Provider, ProviderError } from './provider.ts';

/** Read-only setup diagnostics. Billing access and translation access are distinct. */
export async function checkProviderAccess(provider: Provider, signal: AbortSignal) {
  let walletAccessible = true;
  let creditsAvailable: boolean | null = null;
  let keyAccepted: boolean | null = null;
  try {
    const wallet = (await provider.request('integration/credits', signal)) as {
      remainingCredits?: number;
    };
    keyAccepted = true;
    creditsAvailable =
      typeof wallet?.remainingCredits === 'number' ? wallet.remainingCredits > 0 : null;
  } catch (error) {
    if (!(error instanceof ProviderError) || error.code !== 'provider_forbidden') throw error;
    walletAccessible = false;
  }
  return {
    keyAccepted,
    walletAccessible,
    billingPermissionRequired: !walletAccessible,
    creditsAvailable,
  };
}
