# Requirements Document

## Introduction

GROWI にユーザーの貢献を可視化する「バッジ(勲章)」機能を追加する。現状の GROWI には、Wiki 編集などの貢献をユーザー自身や周囲に見える形で評価・表彰する仕組みが存在しない。本機能では、(1) ページ作成・更新の実績に応じて自動的にバッジが付与される仕組み、(2) それ以外の貢献に対して管理者が手動でバッジを付与できる管理画面、(3) バッジの種類自体を管理画面から自由に追加・編集できる拡張性、(4) 付与されたバッジをユーザー名の隣やユーザーページに表示する仕組みを提供する。

## Boundary Context

- **In scope**:
  - 管理者がバッジの種類(名前・アイコン・説明・自動/手動区分。自動区分の場合はしきい値と段階/レベル)を管理画面で作成・編集・削除できること
  - ページ作成・更新の実績に基づき、しきい値到達時にバッジを自動付与すること(段階的な複数レベル付与を含む)
  - 本機能導入前からの既存の貢献実績を遡って評価し、条件を満たしていれば遡及的に付与すること
  - 管理者が「手動」区分のバッジ種類を任意のユーザーに手動付与できること(付与理由の任意メモを含む)
  - 付与されたバッジをユーザー名/アバターが表示される箇所全般、およびユーザーページに表示すること
  - バッジ付与時に対象ユーザーへアプリ内通知を送ること
  - 管理者が「手動」区分のバッジ付与記録を剥奪(取り消し)できること(剥奪記録は監査目的で保持し、物理削除はしない)
- **Out of scope**:
  - 「自動」区分バッジの取り消し(剥奪)。自動区分は常にシステムが基準に基づいて付与するため、剥奪も対象外とし一貫性を保つ
  - ページ作成・更新以外の活動(コメント投稿等)を自動付与の対象に含めること
  - 「自動」区分のバッジ種類を管理者が手動で付与すること(自動区分は常にシステムが基準に基づいて付与する)
  - バッジ保有数によるランキング/リーダーボード表示
- **Adjacent expectations**: 本機能はユーザー名/アバターが表示される既存の UI 箇所(コメント、ページ更新履歴、サイドバーなど)にバッジ表示を追加するが、それらの箇所自体のレイアウトや機能を変更するものではない。バッジ付与通知は既存のアプリ内通知の仕組みを利用する。要件4(バッジの表示)における「バッジを付与されている」の判定は、剥奪済み(要件7)の付与記録を除いたものを指す。

## Requirements

### Requirement 1: バッジ種類の管理
**Objective:** As a GROWI 管理者, I want バッジの種類を管理画面から自由に作成・編集・削除したい, so that 開発者によるコード変更なしに新しい種類のバッジを増やしていける

#### Acceptance Criteria
1. When 管理者がバッジ種類を新規作成する場合, the Badge Management System shall 名前・アイコン・説明・区分(自動または手動)を必須項目として保存する
2. Where バッジ種類の区分が自動である場合, the Badge Management System shall 貢献回数のしきい値を1つ以上、レベル(段階)ごとに設定できるようにする
3. Where バッジ種類の区分が手動である場合, the Badge Management System shall 貢献回数のしきい値の入力を求めない
4. When 管理者がバッジ種類の名前・アイコン・説明・しきい値を編集する場合, the Badge Management System shall 変更を保存し以降の評価/表示に反映する。ただし既に付与済みのバッジ記録そのものは変更しない
5. When 管理者がバッジ種類を削除する場合, the Badge Management System shall そのバッジ種類による新規付与を停止する。ただし既にユーザーへ付与済みのバッジは削除後もそのユーザーの記録として表示され続ける
6. If 管理者権限を持たないユーザーがバッジ種類の作成・編集・削除を試みた場合, then the Badge Management System shall 操作を拒否する

### Requirement 2: Wiki 編集貢献に基づく自動バッジ付与
**Objective:** As GROWI ユーザー, I want ページの作成・更新を続けることで自動的にバッジを獲得したい, so that 自分の貢献が労力なく可視化される

#### Acceptance Criteria
1. The Badge Granting System shall 各ユーザーのページ作成およびページ更新の実行回数を貢献実績としてカウントする
2. When ユーザーの貢献実績が、ある自動バッジ種類(またはその特定レベル)に設定されたしきい値に到達した場合, the Badge Granting System shall 該当するバッジ(レベル)をそのユーザーへ付与する
3. Where 自動バッジ種類に複数のレベルが設定されている場合, when ユーザーの貢献実績がより上位のレベルのしきい値に到達した場合, the Badge Granting System shall 上位レベルのバッジを追加で付与し、既に付与済みの下位レベルのバッジも記録として保持する
4. The Badge Granting System shall 同一ユーザーに対して同一のバッジ(同一種類・同一レベル)を重複して付与しない
5. If ユーザーが本機能の導入前から蓄積していた貢献実績が既にいずれかのしきい値を満たしている場合, then the Badge Granting System shall 当該バッジ(レベル)を遡及的に付与する
6. The Badge Granting System shall ページ作成およびページ更新以外の活動(コメント投稿等)を自動付与の貢献実績に含めない

### Requirement 3: 手動バッジ付与
**Objective:** As a GROWI 管理者, I want 自動集計できない貢献に対して手動でバッジを付与したい, so that 定量化しにくい貢献(コミュニティ支援やレビューなど)も表彰できる

#### Acceptance Criteria
1. When 管理者が手動区分のバッジ種類と対象ユーザーを選択して付与操作を確定した場合, the Badge Granting System shall そのバッジをユーザーへ付与し、付与者と付与日時を記録する
2. Where 管理者が付与時に理由メモを入力した場合, the Badge Granting System shall そのメモを付与記録とともに保存する
3. If 管理者権限を持たないユーザーが手動付与を試みた場合, then the Badge Granting System shall 操作を拒否する
4. If 管理者が自動区分のバッジ種類を手動付与しようとした場合, then the Badge Granting System shall 操作を拒否し、自動区分は自動評価によってのみ付与される旨を示す
5. The Badge Granting System shall 同一の手動バッジ種類を複数の異なるユーザーへ、それぞれ独立して付与できるようにする

### Requirement 4: バッジの表示
**Objective:** As GROWI ユーザー, I want 他のユーザーが獲得したバッジをひと目で確認したい, so that 誰がどのような貢献をしてきたかを把握できる

#### Acceptance Criteria
1. Where あるユーザーが1つ以上のバッジを付与されている場合, the System shall そのユーザーの名前/アバターが表示される既存の箇所(コメント、ページ更新履歴、サイドバーなど)すべてにバッジのアイコンを併記する
2. If ユーザーがバッジを1つも付与されていない場合, then the System shall バッジ表示領域を空のまま表示し、プレースホルダーは表示しない
3. When ユーザーが他ユーザーのユーザーページを閲覧した場合, the System shall そのユーザーが付与されている全バッジの一覧(バッジ名・アイコン・付与日を含む)を表示する
4. Where 同一のバッジ種類について複数のレベルが付与されている場合, the System shall ユーザー名/アバター併記箇所には最も高いレベルのバッジのみを表示し、ユーザーページには獲得済みの全レベルを表示する
5. When ユーザーがバッジアイコンにカーソルを合わせる、またはフォーカスした場合, the System shall そのバッジの名前と説明を表示する

### Requirement 5: バッジ付与通知
**Objective:** As GROWI ユーザー, I want バッジを獲得したときに気づきたい, so that 自分の貢献が評価されたことをすぐに知ることができる

#### Acceptance Criteria
1. When ユーザーへバッジが付与された場合(自動・手動を問わず), the System shall 既存のアプリ内通知の仕組みを通じて、獲得したバッジ名を含む通知をそのユーザーへ送る

### Requirement 6: バッジアイコンの画像アップロード
**Objective:** As GROWI 管理者, I want バッジ種類のアイコンとして任意の画像ファイルをアップロードしたい, so that Material Symbols や絵文字にない独自デザインのバッジを用意できる

#### Acceptance Criteria
1. When 管理者が「手動」区分のバッジ種類を新規作成または編集する場合, the Badge Management System shall アイコンの指定方法として「Material Symbols」「絵文字」に加えて「画像アップロード」を選択できるようにする
1a. Where バッジ種類の区分が「自動」である場合, the Badge Management System shall 画像アップロードを選択肢として提供しない(引き続き「Material Symbols」「絵文字」のみとする)。自動区分はレベル毎に個別のアイコンを持てる既存の仕様があり、画像アイコンをレベル毎に用意する対応は本 spec のスコープ外とする
2. When 管理者がバッジ種類のアイコンとして画像ファイルをアップロードする場合, the Badge Management System shall 既存の添付ファイル基盤(ファイルサイズ上限・MIME 種別許可リストによる検証を含む)を用いてファイルを保存する
3. If アップロードされたファイルが画像として許可された MIME 種別でない場合, then the Badge Management System shall アップロードを拒否する
4. When あるバッジ種類のアイコン画像が再アップロードされた場合, the Badge Management System shall そのバッジ種類自身に直前に保存されていたアイコン画像のみを新しい画像に置き換える(旧ファイルは孤立させない)。他のバッジ種類が保持する画像アイコンには影響しない
5. When 画像アップロード方式のバッジがユーザー名/アバール表示箇所やユーザーページに表示される場合, the Badge Management System shall Material Symbols/絵文字方式のバッジと同様にアイコン画像を表示する

### Requirement 7: 手動付与バッジの剥奪
**Objective:** As a GROWI 管理者, I want 誤って付与した、または不適切になった手動区分バッジを取り消したい, so that ユーザーへの表示を正しい状態に保てる

#### Acceptance Criteria
1. When 管理者が、あるユーザーに付与済みの手動区分バッジ(アイコン方式を問わない)を剥奪する操作を確定した場合, the Badge Granting System shall その付与記録を「剥奪済み」として記録する
2. When ある付与記録が剥奪済みとなった場合, the Badge Granting System shall 以後そのバッジをユーザー名/アバター併記箇所およびユーザーページの表示対象から除外する
3. The Badge Granting System shall 剥奪操作を行った管理者と剥奪日時を、剥奪済み付与記録とともに保持する
4. If 管理者権限を持たないユーザーが剥奪操作を試みた場合, then the Badge Granting System shall 操作を拒否する
5. If 管理者が「自動」区分のバッジ付与記録を剥奪しようとした場合, then the Badge Granting System shall 操作を拒否し、自動区分は剥奪の対象外である旨を示す
6. When 付与記録が剥奪される場合, the Badge Granting System shall その記録を完全に消去せず、監査目的で保持する
7. Where 管理者が剥奪済みの記録を含む付与履歴を閲覧する場合, the Badge Granting System shall 剥奪状態(剥奪日時・実行者を含む)を判別できる形で示す
