# XRP Spaces

XRP Spacesは、XRP Ledgerを活用した音声配信プラットフォームです。リアルタイムの音声通話と、XRPLのPayment Channelを使用した即時決済を組み合わせています。

## 主な機能

- 🎙️ リアルタイム音声配信ルーム
- 💸 XRPLペイメントチャネルによる分単位の課金
- 🎫 NFTによる入室制限機能
- 🔐 Xamanウォレット認証
- 📊 ダッシュボードでの収支管理

## 技術スタック

- **Frontend**: Next.js, React, TypeScript
- **Backend**: tRPC, Prisma
- **Database**: SQLite (開発環境)
- **Blockchain**: XRP Ledger
- **認証**: Xaman Wallet (旧Xumm)
- **音声通話**: Agora RTC
- **スタイリング**: Tailwind CSS

## セットアップ

1. 依存関係のインストール
```bash
npm install
```

2. 環境変数の設定
`.env`ファイルを作成し、以下の変数を設定してください：

```env
DATABASE_URL="file:./db.sqlite"
XRPL_NETWORK="wss://s.altnet.rippletest.net:51233"
XRPL_SIGNATURE_SECRET="your_signature_secret"
XUMM_API_KEY="your_xumm_api_key"
XUMM_API_SECRET="your_xumm_api_secret"
AGORA_APP_ID="your_agora_app_id"
AGORA_APP_CERTIFICATE="your_agora_certificate"
NEXT_PUBLIC_XRPL_NETWORK="wss://s.altnet.rippletest.net:51233"
NEXT_PUBLIC_AGORA_APP_ID="your_agora_app_id"
NEXT_PUBLIC_XUMM_API_KEY="your_xumm_api_key"
```

3. データベースのセットアップ
```bash
npx prisma db push
```

4. 開発サーバーの起動
```bash
npm run dev
```

## 使い方

1. Xamanウォレットでサインイン
2. ルームを作成または参加
3. リスナーはペイメントチャネルを作成
4. ホストは配信を開始
5. リスナーは配信を視聴
6. ホストは配信を終了
7. ダッシュボードで請求を確認

## ライセンス

Copyright (c) 2025 Nabe3. All rights reserved.