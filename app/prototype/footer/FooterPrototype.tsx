import styles from "./footer-prototype.module.css";

const SIGUAD_LOGO_URL =
  "https://siguad.icu/portal-assets/siguad-wiki-logo-69092cecbd4b.svg";

function FilingLinks() {
  return (
    <span className={styles.filings} aria-label="网站备案信息">
      <a
        className={styles.publicSecurity}
        href="https://beian.mps.gov.cn/#/query/webSearch?code=23050202000040"
        target="_blank"
        rel="noreferrer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/public-security-record-icon.svg" alt="" width={14} height={16} />
        <span>黑公网安备 23050202000040号</span>
      </a>
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
        黑ICP备2025043874号-2
      </a>
    </span>
  );
}

function IdentityRow() {
  return (
    <div className={styles.identity}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src={SIGUAD_LOGO_URL} alt="丝瓜地 SiguaD" />
      <strong>
        <span>丝瓜地：铁皮饭堂</span>
        <small>2026/08/02版</small>
      </strong>
      <FilingLinks />
    </div>
  );
}

function LegalCopy() {
  return (
    <section className={styles.legal} aria-label="版权与开源许可">
      <h3>官方资源与权利归属</h3>
      <p>
        本站由 <a href="https://space.bilibili.com/636117">@猹Cheems</a> 个人整理维护，非 Offworld
        Industries 或 Squad 官方站点。
        <br />
        引用的游戏资产、图片、文字及标识等素材权利归 Offworld
        Industries 及相应权利人所有。
      </p>
      <p>内容仅供资料查询与玩家交流，具体信息以游戏官网、官方公告及游戏内实装为准。</p>
      <div className={styles.fontLine}>
        <h3>字体</h3>
        <p>
          标小智无界黑 / LogoSC Unbounded Sans · 本地 WOFF2 · SIL OFL 1.1 ·
          <a href="/fonts/LogoSCUnboundedSans-OFL.txt">许可全文</a>；微软雅黑、Noto Sans SC、Cascadia Mono
          等由设备提供。
        </p>
      </div>
    </section>
  );
}

function Acknowledgements() {
  return (
    <section className={styles.acknowledgements} aria-label="致谢">
      <div className={styles.sectionIntro}>
        <h3>致谢</h3>
        <p>感谢开源社区和以下项目、集体与个人的帮助：</p>
      </div>
      <ul>
        <li><a href="https://squad-armor.com/">Squad Armor</a><span>启发了作者制作本项目。</span></li>
        <li><a href="https://cloud.tencent.com/document/product/1552/118985">腾讯云 EdgeOne</a><span>提供了 CDN。</span></li>
        <li><a href="https://store.epicgames.com/p/squad?lang=en-US">Squad Editor</a><span>提供部分数据与算法。</span></li>
      </ul>
      <div className={styles.actions}>
        <button type="button" className={`${styles.actionButton} ${styles.sponsorButton}`}>
          赞助本项目
        </button>
        <a className={styles.actionButton} href="https://docs.qq.com/form/page/DRnd4bWtKUGNnT3Vu">
          反馈问题 / 提建议
        </a>
        <button type="button" className={styles.actionButton}>更新日志</button>
      </div>
    </section>
  );
}

const SUPPORTERS = [
  { name: "飞行ACV", note: "" },
  { name: "Predent假装", note: "" },
  { name: "麦克西Mafty", note: "🐊混乱将随后而至🐊" },
  { name: "🚩Blanl_Null空白", note: "不会反绕后的反绕后" },
];

function Supporters() {
  return (
    <section className={styles.supporters} aria-label="赞助名单与友链">
      <div className={styles.supportersIntro}>
        <h3>赞助名单/友链</h3>
        <p>感谢每一位支持者，您可以赞助或协助宣传本项目。名单与友链将持续更新。</p>
      </div>
      <ul>
        {SUPPORTERS.map((supporter) => (
          <li key={supporter.name}>
            <strong>{supporter.name}</strong>
            {supporter.note ? <small>{supporter.note}</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FooterPrototype() {
  return (
    <main className={styles.prototypePage}>
      <div className={styles.contextStrip} aria-hidden="true">
        <span>SIGUA ARMOR</span>
        <span>COMPACT FOOTER STUDY · S2</span>
      </div>
      <footer className={styles.footerFrame}>
        <div className={styles.footerGrid}>
          <div className={styles.primaryColumn}>
            <div className={styles.technology}>点击查看本站开源与隐私合规说明 <span>＋</span></div>
            <LegalCopy />
            <IdentityRow />
          </div>
          <Acknowledgements />
          <Supporters />
        </div>
      </footer>
    </main>
  );
}
