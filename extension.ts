import * as vscode from 'vscode';

type Network = 'mainnet' | 'testnet';

interface AccountState {
  amount: string;
  storage_usage: number;
}

interface NearBlocksTxn {
  method?: string;
  action_kind?: string;
  block_timestamp?: number | string;
}

const ACCOUNT_REGEX =
  /\b((?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*|[a-f0-9]{64})\b/g;

function getNetwork(): Network {
  return vscode.workspace.getConfiguration('nearAccountLookup').get<Network>('network', 'mainnet');
}

function isNearAccountId(value: string): boolean {
  if (value.length < 2 || value.length > 64) {
    return false;
  }
  return (
    /^[a-f0-9]{64}$/.test(value) ||
    /^(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*$/.test(value)
  );
}

function formatNearAmount(yocto: string): string {
  const yoctoValue = BigInt(yocto);
  const base = BigInt(10) ** BigInt(24);
  const whole = yoctoValue / base;
  const fraction = (yoctoValue % base).toString().padStart(24, '0').slice(0, 4);
  return `${whole}.${fraction}`.replace(/\.?0+$/, '');
}

function explorerAccountUrl(network: Network, accountId: string): string {
  return `https://explorer.${network}.near.org/accounts/${accountId}`;
}

function nearBlocksBaseUrl(network: Network): string {
  return network === 'mainnet' ? 'https://api.nearblocks.io' : 'https://api-testnet.nearblocks.io';
}

async function rpcViewAccount(network: Network, accountId: string): Promise<AccountState> {
  const response = await fetch(`https://rpc.${network}.near.org`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'near-account-lookup',
      method: 'query',
      params: {
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId
      }
    })
  });

  if (!response.ok) {
    throw new Error(`RPC request failed (${response.status})`);
  }

  const body = await response.json() as { result?: AccountState; error?: unknown };
  if (body.error || !body.result) {
    throw new Error('Account query failed');
  }
  return body.result;
}

function normalizeTimestamp(input: number | string | undefined): number | null {
  if (typeof input === 'number') {
    return input;
  }
  if (typeof input === 'string') {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatTxDate(timestampNs: number | string | undefined): string {
  const value = normalizeTimestamp(timestampNs);
  if (!value) {
    return 'unknown time';
  }
  const date = new Date(Math.floor(value / 1_000_000));
  if (Number.isNaN(date.getTime())) {
    return 'unknown time';
  }
  return date.toLocaleString();
}

async function fetchRecentActivity(network: Network, accountId: string): Promise<string[]> {
  const response = await fetch(`${nearBlocksBaseUrl(network)}/v1/account/${accountId}/txns?limit=3`);
  if (!response.ok) {
    return [];
  }

  const body = await response.json() as { txns?: NearBlocksTxn[] };
  const txns = Array.isArray(body.txns) ? body.txns : [];

  return txns.slice(0, 3).map((tx) => {
    const action = tx.method || tx.action_kind || 'transaction';
    return `- ${action} (${formatTxDate(tx.block_timestamp)})`;
  });
}

function registerAccountLinks(context: vscode.ExtensionContext): void {
  const provider = vscode.languages.registerDocumentLinkProvider({ scheme: 'file' }, {
    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
      const links: vscode.DocumentLink[] = [];
      const text = document.getText();
      for (const match of text.matchAll(ACCOUNT_REGEX)) {
        const accountId = match[0];
        const index = match.index;
        if (index === undefined || !isNearAccountId(accountId)) {
          continue;
        }

        const start = document.positionAt(index);
        const end = document.positionAt(index + accountId.length);
        const network = getNetwork();
        links.push(
          new vscode.DocumentLink(
            new vscode.Range(start, end),
            vscode.Uri.parse(explorerAccountUrl(network, accountId))
          )
        );
      }
      return links;
    }
  });

  context.subscriptions.push(provider);
}

export function activate(context: vscode.ExtensionContext): void {
  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    async provideHover(document, position): Promise<vscode.Hover | null> {
      const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9._-]+/);
      if (!range) {
        return null;
      }

      const accountId = document.getText(range).toLowerCase();
      if (!isNearAccountId(accountId)) {
        return null;
      }

      const network = getNetwork();

      try {
        const [state, recentActivity] = await Promise.all([
          rpcViewAccount(network, accountId),
          fetchRecentActivity(network, accountId)
        ]);

        const markdown = new vscode.MarkdownString(undefined, true);
        markdown.isTrusted = true;
        markdown.appendMarkdown(`### NEAR Account: \`${accountId}\`\n\n`);
        markdown.appendMarkdown(`- **Balance:** ${formatNearAmount(state.amount)} NEAR\n`);
        markdown.appendMarkdown(`- **Storage:** ${state.storage_usage} bytes\n`);
        markdown.appendMarkdown(`- **Network:** ${network}\n`);

        markdown.appendMarkdown('\n**Recent activity (last 3):**\n');
        if (recentActivity.length === 0) {
          markdown.appendMarkdown('- unavailable\n');
        } else {
          markdown.appendMarkdown(`${recentActivity.join('\n')}\n`);
        }

        markdown.appendMarkdown(`\n[Open in NEAR Explorer](${explorerAccountUrl(network, accountId)})`);
        return new vscode.Hover(markdown, range);
      } catch {
        return null;
      }
    }
  });

  context.subscriptions.push(hoverProvider);
  registerAccountLinks(context);
}

export function deactivate(): void {}
