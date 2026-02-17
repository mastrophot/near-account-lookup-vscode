import * as vscode from 'vscode';
import { connect, providers } from 'near-api-js';

export function activate(context: vscode.ExtensionContext) {
  console.log('NEAR Account Lookup is now active');

  const hoverProvider = vscode.languages.registerHoverProvider({ scheme: 'file' }, {
    async provideHover(document, position, token) {
      const range = document.getWordRangeAtPosition(position, /(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+/);
      if (!range) return;

      const accountId = document.getText(range);
      if (accountId.length < 2 || accountId.length > 64) return;

      const network = vscode.workspace.getConfiguration('nearAccountLookup').get('network', 'mainnet');
      
      try {
        const provider = new providers.JsonRpcProvider({ url: `https://rpc.${network}.near.org` });
        const state: any = await provider.query({
          request_type: "view_account",
          finality: "final",
          account_id: accountId,
        });

        const balance = (BigInt(state.amount) / BigInt(10**24)).toString();
        
        // Fetch Recent Activity (Example using NearBlocks API for real data)
        let recentActivity = '';
        try {
          const apiNetwork = network === 'mainnet' ? 'api' : 'api-testnet';
          const rx = await fetch(`https://${apiNetwork}.nearblocks.io/v1/account/${accountId}/txns?limit=3`);
          const txData: any = await rx.json();
          if (txData && txData.txns && txData.txns.length > 0) {
            recentActivity = '\n\n**Recent Activity:**\n';
            txData.txns.forEach((tx: any) => {
              const date = new Date(tx.block_timestamp / 1000000).toLocaleDateString();
              recentActivity += `- ${tx.method || tx.action_kind}: ${date}\n`;
            });
          }
        } catch (e) {
          recentActivity = '\n\n*Recent activity unavailable*';
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`### 🟣 NEAR Account: **${accountId}**\n\n`);
        markdown.appendMarkdown(`- **Balance:** ${balance} NEAR\n`);
        markdown.appendMarkdown(`- **Network:** ${network}\n`);
        markdown.appendMarkdown(`- **Storage:** ${state.storage_usage} bytes\n`);
        markdown.appendMarkdown(recentActivity);
        markdown.appendMarkdown(`\n\n[View on Explorer](https://explorer.${network}.near.org/accounts/${accountId})`);
        
        return new vscode.Hover(markdown);
      } catch (error) {
        // Account likely doesn't exist or RPC error
        return null;
      }
    }
  });

  context.subscriptions.push(hoverProvider);
}


export function deactivate() {}
