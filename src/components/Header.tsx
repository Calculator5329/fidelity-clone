import './Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-text">Fidelity</span>
          <span className="logo-dot">.</span>
        </div>
        <nav className="main-nav">
          <a href="#" className="nav-link">Accounts & Trade</a>
          <a href="#" className="nav-link">Planning & Advice</a>
          <a href="#" className="nav-link">News & Research</a>
          <a href="#" className="nav-link">Products</a>
          <a href="#" className="nav-link">Why Fidelity</a>
        </nav>
      </div>
      <div className="header-right">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input type="text" placeholder="How can we help?" className="search-input" />
        </div>
        <div className="header-actions">
          <a href="#" className="header-link">Open an Account</a>
          <a href="#" className="header-link">Customer Service</a>
          <a href="#" className="header-link">Fidelity Assistant</a>
          <a href="#" className="header-link">Profile</a>
          <a href="#" className="header-link">Log Out</a>
        </div>
      </div>
    </header>
  );
}

export function SubHeader() {
  return (
    <div className="sub-header">
      <div className="sub-header-actions">
        <button className="action-btn">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M7.5 21H2V9l10-7 10 7v12h-5.5v-9h-9v9z"/>
          </svg>
          Trade
        </button>
        <button className="action-btn">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
          </svg>
          Transfer
        </button>
        <button className="action-btn">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
          </svg>
          Pay Bills
        </button>
        <button className="action-btn">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z"/>
          </svg>
          Quote
        </button>
      </div>
      <div className="sub-header-right">
        <button className="messages-btn">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          Messages (9)
        </button>
      </div>
    </div>
  );
}
