const React = require('react');
const {findDOMNode} = require('react-dom');
const {ipcRenderer, remote, shell} = require('electron');
const url = require('url');
const electronContextMenu = require('electron-context-menu');

const ErrorView = require('./ErrorView.jsx');

const preloadJS = `file://${remote.app.getAppPath()}/browser/webview/mattermost_bundle.js`;

const MattermostView = React.createClass({
  propTypes: {
    name: React.PropTypes.string,
    id: React.PropTypes.string,
    onTargetURLChange: React.PropTypes.func,
    onUnreadCountChange: React.PropTypes.func,
    src: React.PropTypes.string,
    style: React.PropTypes.object
  },

  getInitialState() {
    return {
      errorInfo: null,
      isContextMenuAdded: false
    };
  },

  handleUnreadCountChange(unreadCount, mentionCount, isUnread, isMentioned) {
    if (this.props.onUnreadCountChange) {
      this.props.onUnreadCountChange(unreadCount, mentionCount, isUnread, isMentioned);
    }
  },

  componentDidMount() {
    var self = this;
    var webview = findDOMNode(this.refs.webview);

    webview.addEventListener('did-fail-load', (e) => {
      console.log(self.props.name, 'webview did-fail-load', e);
      if (e.errorCode === -3) { // An operation was aborted (due to user action).
        return;
      }

      self.setState({
        errorInfo: e
      });
      function reload() {
        window.removeEventListener('online', reload);
        self.reload();
      }
      if (navigator.onLine) {
        setTimeout(reload, 30000);
      } else {
        window.addEventListener('online', reload);
      }
    });

    // Open link in browserWindow. for exmaple, attached files.
    webview.addEventListener('new-window', (e) => {
      var currentURL = url.parse(webview.getURL());
      var destURL = url.parse(e.url);
      if (destURL.protocol !== 'http:' && destURL.protocol !== 'https:') {
        ipcRenderer.send('confirm-protocol', destURL.protocol, e.url);
        return;
      }
      if (currentURL.host === destURL.host) {
        // New window should disable nodeIntergration.
        window.open(e.url, 'Mattermost', 'nodeIntegration=no, show=yes');
      } else {
        // if the link is external, use default browser.
        shell.openExternal(e.url);
      }
    });

    // 'dom-ready' means "content has been loaded"
    // So this would be emitted again when reloading a webview
    webview.addEventListener('dom-ready', () => {
      // webview.openDevTools();

      if (!this.state.isContextMenuAdded) {
        electronContextMenu({
          window: webview
        });
        this.setState({isContextMenuAdded: true});
      }
    });

    webview.addEventListener('update-target-url', (event) => {
      if (self.props.onTargetURLChange) {
        self.props.onTargetURLChange(event.url);
      }
    });

    webview.addEventListener('ipc-message', (event) => {
      switch (event.channel) {
      case 'onUnreadCountChange':
        var unreadCount = event.args[0];
        var mentionCount = event.args[1];

        // isUnread and isMentioned is pulse flag.
        var isUnread = event.args[2];
        var isMentioned = event.args[3];
        self.handleUnreadCountChange(unreadCount, mentionCount, isUnread, isMentioned);
        break;
      case 'onNotificationClick':
        self.props.onNotificationClick();
        break;
      }
    });

    webview.addEventListener('page-title-updated', (event) => {
      if (self.props.active) {
        ipcRenderer.send('update-title', {
          title: event.title
        });
      }
    });

    webview.addEventListener('console-message', (e) => {
      const message = `[${this.props.name}] ${e.message}`;
      switch (e.level) {
      case 0:
        console.log(message);
        break;
      case 1:
        console.warn(message);
        break;
      case 2:
        console.error(message);
        break;
      default:
        console.log(message);
        break;
      }
    });
  },

  reload() {
    this.setState({
      errorInfo: null
    });
    var webview = findDOMNode(this.refs.webview);
    webview.reload();
  },

  clearCacheAndReload() {
    this.setState({
      errorInfo: null
    });
    var webContents = findDOMNode(this.refs.webview).getWebContents();
    webContents.session.clearCache(() => {
      webContents.reload();
    });
  },

  focusOnWebView() {
    const webview = findDOMNode(this.refs.webview);
    if (!webview.getWebContents().isFocused()) {
      webview.focus();
      webview.getWebContents().focus();
    }
  },

  canGoBack() {
    const webview = findDOMNode(this.refs.webview);
    return webview.getWebContents().canGoBack();
  },

  canGoForward() {
    const webview = findDOMNode(this.refs.webview);
    return webview.getWebContents().canGoForward();
  },

  goBack() {
    const webview = findDOMNode(this.refs.webview);
    webview.getWebContents().goBack();
  },

  goForward() {
    const webview = findDOMNode(this.refs.webview);
    webview.getWebContents().goForward();
  },

  render() {
    const errorView = this.state.errorInfo ? (
      <ErrorView
        id={this.props.id + '-fail'}
        style={this.props.style}
        className='errorView'
        errorInfo={this.state.errorInfo}
      />) : null;

    // Need to keep webview mounted when failed to load.
    return (
      <div>
        { errorView }
        <webview
          id={this.props.id}
          className='mattermostView'
          style={this.props.style}
          preload={preloadJS}
          src={this.props.src}
          ref='webview'
        />
      </div>);
  }
});

module.exports = MattermostView;
