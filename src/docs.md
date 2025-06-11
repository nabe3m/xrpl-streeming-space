# 📡 XRPL × Spaces風 音声配信サービス PoC 仕様書

## ✅ 概要

XRPLのネイティブ機能を活用し、X（旧Twitter）の「スペース」のような音声配信サービスを構築する。  
NFTによるアクセス制限、PaymentChannelによる秒単位のXRP支払い、Agora SDKによるリアルタイム音声配信などを取り入れる。

---

## 🔐 ログイン機能

- Xamanウォレットによるログイン（[Xumm Universal SDK](https://github.com/XRPL-Labs/Xumm-Universal-SDK)）

---

## ⚙️ 仕様

### 🎯 ビジネスロジック

- 配信者はウォレットログインし、自由にルームを作成可能
- 参加者はログイン後、ルームURLからアクセス
- 配信者は自身が所有するNFTまたはNFTコレクションにより、入場制限をかけられる（選択UIあり）

### 👤 プロフィール機能

- DBでユーザー情報を管理
  - アイコン（画像）
  - ニックネーム
  - SNSリンク（X, Facebook, Instagram）
- `EmailHash`が設定されていれば Gravatar を利用

### 📡 ルーム作成時

- 1分あたりのXRP消費金額を設定可能
- 入場制限NFTの指定（任意）

### 🔊 配信中の動作

- リスナーは音声配信権限（ホストではない）をリクエストできる
- 入場時、ホストに対して **Payment Channel** を作成(PaymentChannelCreate)
- ルーム滞在中、リスナーは1秒ごとにオフチェーンで支払い（例: `0.01 XRP/分 ÷ 60 = 0.000166 XRP/秒`）（オーナーのシークレットキーを用いてsignPaymentChannelClaimを行う）
- ユーザーは現在の自身とホストとの間にPaymentChannelの状態をリアルタイムで確認できる
- ホストも現在、リスナーの支払い状況をリアルタイムで確認できる

### 🔚 配信終了後

- 配信者はリスナーに紐づいた PaymentChannel をバッチでクローズ可能（一度の署名で完了できると良い）
- 請求一覧や支払い確認が可能

### 🛠 管理画面

- 配信履歴と参加者情報（アドレス＆ユーザー情報）を確認可能
- 参加者に対してNFTを選択してMINT（選択・一括指定）
- ルームタイトルや画像の設定（IPFSアップロード）
- NFTのメタデータ（JSON）をIPFSにアップロードし、URIに指定

---

## 📚 参考ドキュメント

- https://xrpl.org/
- https://js.xrpl.org/

---

## 💻 技術スタック

- **T3 Stack**
  - Next.js, TypeScript, Tailwind CSS
  - tRPC, Prisma, Zod, Clerk/NextAuthなど
- **Agora SDK**
  - 音声通信
- **XRPL (Testnet)**
- **Xumm Universal SDK**
- **その他**
  - Biome
  - IPFS
  - Neon (Vercel PostgreSQL)

---

## 🚀 デプロイ環境

- Vercel（フロント & API Routes）
- Neon（PostgreSQL）
- ローカル開発時は SQLite

---

## 🧪 開発方針

- セキュリティを重視（署名・認証・入退場制御）
- サーバーレスへの負荷を抑える
- TDD/DDD をバランスよく導入
- 必要に応じて Cursor ベースのページネーションを導入

---

## 💸 ペイメントチャネル - 実装サンプル（Node.js）

アプリに署名用の「代表アカウント」を保持し、`.env` に秘密鍵をセット。

```js
const xrpl = require('xrpl');

const client = new xrpl.Client('wss://testnet.xrpl-labs.com');

(async () => {
  await client.connect();
  const signature = (await client.fundWallet()).wallet;
  const alice = (await client.fundWallet()).wallet;
  const bob = (await client.fundWallet()).wallet;

  // チャネル作成
  await client.submitAndWait(
    {
      TransactionType: 'PaymentChannelCreate',
      Account: alice.address,
      Destination: bob.address,
      Amount: xrpl.xrpToDrops(5),
      SettleDelay: 86400,
      PublicKey: signature.publicKey,
    },
    { wallet: alice }
  );

  // チャネルID取得
  const res = await client.request({
    command: 'account_channels',
    account: alice.address,
  });
  const channel_id = res.result.channels[0].channel_id;

  let paychanSignature = '';

  // クレーム署名（オフレジャー）
  for (let i = 1; i <= 1000; i++) {
    const amount = (0.001 * i).toFixed(6);
    const formatted = parseFloat(amount).toString();
    paychanSignature = xrpl.signPaymentChannelClaim(channel_id, formatted, signature.privateKey);

    // 検証
    if (!xrpl.verifyPaymentChannelClaim(channel_id, formatted, paychanSignature, signature.publicKey)) {
      throw new Error('Invalid signature');
    }
  }

  // チャネル情報確認
  const res1 = await client.request({
    command: 'account_channels',
    account: alice.address,
    destination_account: bob.address,
  });
  console.log(res1.result.channels);

  // クレーム送信（オンチェーン）
  const res2 = await client.submitAndWait(
    {
      TransactionType: 'PaymentChannelClaim',
      Account: bob.address,
      Channel: channel_id,
      Balance: xrpl.xrpToDrops(1),
      Amount: xrpl.xrpToDrops(1),
      Signature: paychanSignature,
      PublicKey: signature.publicKey,
    },
    { wallet: bob }
  );
  console.log(res2.result);

  await client.disconnect();
})();
