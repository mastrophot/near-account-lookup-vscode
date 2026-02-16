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
        
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`### 🟣 NEAR Account: **${accountId}**\n\n`);
        markdown.appendMarkdown(`- **Balance:** ${balance} NEAR\n`);
        markdown.appendMarkdown(`- **Network:** ${network}\n`);
        markdown.appendMarkdown(`- **Storage:** ${state.storage_usage} bytes\n\n`);
        markdown.appendMarkdown(`[View on Explorer](https://explorer.${network}.near.org/accounts/${accountId})`);
        
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
