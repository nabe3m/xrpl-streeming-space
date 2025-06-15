# XRP Spaces

XRP Spacesは、XRP Ledgerを活用した音声配信プラットフォームです。リアルタイムの音声通話と、XRPLのPayment ChannelやNFTを使用した柔軟な課金システムを組み合わせています。

## 主な機能

### 音声配信
- 🎙️ リアルタイム音声配信ルーム（Agora RTC使用）
- 👥 ホストとリスナーの役割分離
- 🔊 音声レベルインジケーター
- 🎯 発言権リクエスト・付与機能
- ⏸️ 残高不足時の自動音声停止機能

### 決済システム
- 💸 XRPLペイメントチャネルによる分単位の従量課金
- 🎫 NFTチケットによる定額入場料モデル
- 💰 オフレジャー署名による効率的な決済
- 📊 リアルタイム残高表示
- 💳 デポジット追加機能

### NFT機能
- 🎟️ ルーム専用NFTチケットの発行
- 🔐 NFT所有者のみアクセス可能なルーム
- 📜 NFT所有証明の表示（エクスプローラーリンク付き）
- 🖼️ カスタムNFTイメージのサポート

### ユーザー管理
- 🔐 Xaman (旧Xumm) ウォレット認証
- 👤 ユーザープロフィール（ニックネーム設定）
- 📊 ダッシュボードでの収支管理
- 💵 ペイメントチャネルのクレーム機能

## 技術スタック

- **Frontend**: Next.js 15, React 18, TypeScript
- **Backend**: tRPC, Prisma
- **Database**: SQLite (開発環境) / PostgreSQL (本番環境)
- **Blockchain**: XRP Ledger
- **認証**: Xaman Wallet API
- **音声通話**: Agora RTC SDK
- **スタイリング**: Tailwind CSS
- **ホスティング**: Vercel対応

## セットアップ

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env`ファイルを作成し、以下の変数を設定してください：

```env
# Database
DATABASE_URL="file:./db.sqlite"

# XRP Ledger
XRPL_NETWORK="wss://s.altnet.rippletest.net:51233"
XRPL_SIGNATURE_SECRET="your_signature_secret"

# Xaman (Xumm) API
XUMM_API_KEY="your_xumm_api_key"
XUMM_API_SECRET="your_xumm_api_secret"

# Agora RTC
AGORA_APP_ID="your_agora_app_id"
AGORA_APP_CERTIFICATE="your_agora_certificate"

# IPFS (for NFT metadata)
IPFS_API_URL="your_ipfs_api_url"
IPFS_API_KEY="your_ipfs_api_key"

# Public環境変数
NEXT_PUBLIC_XRPL_NETWORK="wss://s.altnet.rippletest.net:51233"
NEXT_PUBLIC_AGORA_APP_ID="your_agora_app_id"
NEXT_PUBLIC_XUMM_API_KEY="your_xumm_api_key"
```

schema.local.prisma を使用してください。

### 3. データベースのセットアップ
```bash
# 開発環境
npm run db:push

# マイグレーション実行
npm run db:migrate

# Prisma Studio起動（データ確認用）
npm run db:studio
```

### 4. 開発サーバーの起動
```bash
npm run dev
```

アプリケーションは http://localhost:3000 で起動します。

## 使い方

### 通常のルーム（Payment Channel方式）
1. Xamanウォレットでサインイン
2. ルームを作成（料金設定：XRP/分）
3. リスナーはペイメントチャネルを作成してデポジット
4. ホストは配信を開始
5. リスナーは分単位で自動課金されながら視聴
6. 残高不足時は自動的に音声が停止
7. デポジット追加で視聴継続可能

### NFTチケットルーム
1. ホストがNFTチケット付きルームを作成
2. リスナーはNFTチケットを購入（一度だけ）
3. NFT所有者は何度でも入室可能
4. NFT所有証明がルーム内に表示

### 収益管理
- ダッシュボードで未請求の支払いを確認

## 開発者向けコマンド

```bash
# 型チェック
npm run typecheck

# コードフォーマット
npm run check:write

# ビルド
npm run build

# 本番環境起動
npm start
```

## プロジェクト構造

```
xrpl-clubhouse/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # API routes
│   │   ├── auth/         # 認証関連
│   │   ├── dashboard/    # ダッシュボード
│   │   ├── rooms/        # ルーム関連
│   │   └── dev/          # 開発ツール
│   ├── components/       # Reactコンポーネント
│   ├── contexts/         # React Context
│   ├── hooks/            # カスタムフック
│   ├── lib/              # ユーティリティ関数
│   │   ├── xrpl.ts       # XRP Ledger関連
│   │   ├── xrpl-nft.ts   # NFT関連
│   │   ├── xumm.ts       # Xaman API
│   │   ├── agora.ts      # Agora RTC
│   │   └── ipfs.ts       # IPFS関連
│   ├── server/           # サーバーサイド
│   │   └── api/          # tRPC API
│   └── trpc/             # tRPCクライアント
├── prisma/               # データベーススキーマ
└── public/               # 静的ファイル
```

## 主要な機能の詳細

### Payment Channel（オフレジャー決済）
- XRP Ledgerのペイメントチャネルを使用した効率的な少額決済
- オフレジャー署名により、毎秒の決済でもトランザクション手数料なし
- リアルタイムの残高追跡と自動課金停止
- チャネル情報のレジャー同期機能

### NFTチケットシステム
- XLS-20規格に準拠したNFT発行
- NFTokenMinter権限を使用した委任発行
- IPFSを使用したメタデータ保存
- ルームごとのユニークなTaxon管理

### セキュリティ機能
- Xamanウォレットによる安全な認証
- オフレジャー署名の検証
- 残高不足時の自動サービス停止
- ホストによる参加者管理

## トラブルシューティング

### よくある問題

1. **Agora接続エラー**
   - Agora App IDとCertificateが正しく設定されているか確認
   - ブラウザのマイク権限を許可しているか確認

2. **XRP Ledger接続エラー**
   - ネットワークURLが正しいか確認（testnet/mainnet）
   - 署名用ウォレットに十分なXRPがあるか確認

3. **NFT発行エラー**
   - NFTokenMinter権限が正しく設定されているか確認
   - IPFSが正しく設定されているか確認

## 備考、免責事項

このプロジェクトはハッカソン提出用として公開しており、セキュリティに関しては考慮していません。
当プロジェクトのデモサイト、ソースコードなどの二次利用による一切の責任を負いません。