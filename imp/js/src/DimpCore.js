/**
 * DimpCore.js - Dimp UI application logic.
 * NOTE: ContextSensitive.js must be loaded before this file.
 *
 * Copyright 2005-2009 The Horde Project (http://www.horde.org/)
 *
 * See the enclosed file COPYING for license information (GPL). If you
 * did not receive this file, see http://www.fsf.org/copyleft/gpl.html.
 */

/* Trick some Horde js into thinking this is the parent Horde window. */
var frames = { horde_main: true },

/* DimpCore object. */
DimpCore = {
    // Vars used and defaulting to null/false:
    //   DMenu, alertrequest, inAjaxCallback, is_logout, onDoActionComplete
    server_error: 0,

    buttons: [
        'button_reply', 'button_forward', 'button_spam', 'button_ham',
        'button_deleted'
    ],

    doActionOpts: {
        onException: function(r, e) { DimpCore.debug('onException', e); },
        onFailure: function(t, o) { DimpCore.debug('onFailure', t); },
        evalJS: false,
        evalJSON: true
    },

    debug: function(label, e)
    {
        if (!this.is_logout && DIMP.conf.debug) {
            alert(label + ': ' + ((e instanceof Error && e.name && e.message) ? e.name + '-' + e.message : Object.inspect(e)) + (e.lineNumber ? ' (Line #' + e.lineNumber + ')' : ''));
        }
    },

    // Convert object to an IMP UID Range string. See IMP::toRangeString()
    // ob = (object) mailbox name as keys, values are array of uids.
    toRangeString: function(ob)
    {
        var str = '';

        $H(ob).each(function(o) {
            if (!o.value.size()) {
                return;
            }

            var u = o.value.numericSort(),
                first = last = u.shift(),
                out = [];

            u.each(function(k) {
                if (last + 1 == k) {
                    last = k;
                } else {
                    out.push(first + (last == first ? '' : (':' + last)));
                    first = last = k;
                }
            });
            out.push(first + (last == first ? '' : (':' + last)));
            str += '{' + o.key.length + '}' + o.key + out.join(',');
        });

        return str;
    },

    // Parses an IMP UID Range string. See IMP::parseRangeString()
    // str = (string) An IMP UID range string.
    parseRangeString: function(str)
    {
        var count, end, i, mbox,
            mlist = {},
            uids = [];
        str = str.strip();

        while (!str.blank()) {
            if (!str.startsWith('{')) {
                break;
            }
            i = str.indexOf('}');
            count = Number(str.substr(1, i - 1));
            mbox = str.substr(i + 1, count);
            i += count + 1;
            end = str.indexOf('{', i);
            if (end == -1) {
                uidstr = str.substr(i);
                str = '';
            } else {
                uidstr = str.substr(i, end - i);
                str = str.substr(end);
            }

            uidstr.split(',').each(function(e) {
                var r = e.split(':');
                if (r.size() == 1) {
                    uids.push(Number(e));
                } else {
                    uids = uids.concat($A($R(Number(r[0]), Number(r[1]))));
                }
            });

            mlist[mbox] = uids;
        }

        return mlist;
    },

    /* 'action' -> if action begins with a '*', the exact string will be used
     *  instead of sending the action to the IMP handler. */
    doAction: function(action, params, uids, callback, opts)
    {
        var b, tmp = {};

        opts = Object.extend(this.doActionOpts, opts || {});
        params = $H(params);
        action = action.startsWith('*')
            ? action.substring(1)
            : DIMP.conf.URI_IMP + '/' + action;
        if (uids) {
            if (uids.viewport_selection) {
                b = uids.getBuffer();
                if (b.getMetaData('search')) {
                    uids.get('dataob').each(function(r) {
                        if (!tmp[r.view]) {
                            tmp[r.view] = [];
                        }
                        tmp[r.view].push(r.imapuid);
                    });
                } else {
                    tmp[b.getView()] = uids.get('uid');
                }
                uids = tmp;
            }
            params.set('uid', this.toRangeString(uids));
        }
        if (DIMP.conf.SESSION_ID) {
            params.update(DIMP.conf.SESSION_ID.toQueryParams());
        }
        opts.parameters = params.toQueryString();
        opts.onComplete = function(t, o) { this.doActionComplete(t, callback); }.bind(this);
        new Ajax.Request(action, opts);
    },

    doActionComplete: function(request, callback)
    {
        this.inAjaxCallback = true;

        if (!request.responseJSON) {
            if (++this.server_error == 3) {
                this.showNotifications([ { type: 'horde.error', message: DIMP.text.ajax_timeout } ]);
            }
            this.inAjaxCallback = false;
            return;
        }

        var r = request.responseJSON;

        if (!r.msgs) {
            r.msgs = [];
        }

        if (r.response && Object.isFunction(callback)) {
            try {
                callback(r);
            } catch (e) {
                this.debug('doActionComplete', e);
            }
        }

        if (this.server_error >= 3) {
            r.msgs.push({ type: 'horde.success', message: DIMP.text.ajax_recover });
        }
        this.server_error = 0;

        if (!r.msgs_noauto) {
            this.showNotifications(r.msgs);
        }

        if (this.onDoActionComplete) {
            this.onDoActionComplete(r);
        }

        this.inAjaxCallback = false;
    },

    setTitle: function(title)
    {
        document.title = DIMP.conf.name + ' :: ' + title;
    },

    showNotifications: function(msgs)
    {
        if (!msgs.size() || this.is_logout) {
            return;
        }

        msgs.find(function(m) {
            switch (m.type) {
            case 'dimp.timeout':
                this.logout(DIMP.conf.timeout_url);
                return true;

            case 'horde.error':
            case 'horde.message':
            case 'horde.success':
            case 'horde.warning':
            case 'imp.reply':
            case 'imp.forward':
            case 'imp.redirect':
            case 'dimp.request':
            case 'dimp.sticky':
                var iefix, log, tmp,
                    alerts = $('hordeAlerts'),
                    div = new Element('DIV', { className: m.type.replace('.', '-') }),
                    msg = m.message;

                if (!alerts) {
                    alerts = new Element('DIV', { id: 'hordeAlerts' });
                    $(document.body).insert(alerts);
                }

                if ($w('dimp.request dimp.sticky').indexOf(m.type) == -1) {
                    msg = msg.unescapeHTML().unescapeHTML();
                }
                alerts.insert(div.update(msg));

                // IE6 has a bug that does not allow the body of a div to be
                // clicked to trigger an onclick event for that div (it only
                // seems to be an issue if the div is overlaying an element
                // that itself contains an image).  However, the alert box
                // normally displays over the message list, and we use several
                // graphics in the default message list layout, so we see this
                // buggy behavior 99% of the time.  The workaround is to
                // overlay the div with a like sized div containing a clear
                // gif, which tricks IE into the correct behavior.
                if (DIMP.conf.is_ie6) {
                    iefix = new Element('DIV', { id: 'hordeIE6AlertsFix' }).clonePosition(div, { setLeft: false, setTop: false });
                    iefix.insert(div.remove());
                    alerts.insert(iefix);
                }

                if ($w('horde.error dimp.request dimp.sticky').indexOf(m.type) == -1) {
                    this.alertsFade.bind(this, div).delay(m.type == 'horde.warning' ? 10 : 3);
                }

                if (m.type == 'dimp.request') {
                    this.alertrequest = div;
                }

                if (tmp = $('hordeAlertslog')) {
                    switch (m.type) {
                    case 'horde.error':
                        log = DIMP.text.alog_error;
                        break;

                    case 'horde.message':
                        log = DIMP.text.alog_message;
                        break;

                    case 'horde.success':
                        log = DIMP.text.alog_success;
                        break;

                    case 'horde.warning':
                        log = DIMP.text.alog_warning;
                        break;
                    }

                    if (log) {
                        tmp = tmp.down('DIV UL');
                        if (tmp.down().hasClassName('hordeNoalerts')) {
                            tmp.down().remove();
                        }
                        tmp.insert(new Element('LI').insert(new Element('P', { className: 'label' }).insert(log)).insert(new Element('P', { className: 'indent' }).insert(msg).insert(new Element('SPAN', { className: 'alertdate'} ).insert('[' + (new Date).toLocaleString() + ']'))));
                    }
                }
            }
        }, this);
    },

    alertsFade: function(elt)
    {
        if (elt) {
            Effect.Fade(elt, { duration: 1.5, afterFinish: this.removeAlert.bind(this) });
        }
    },

    toggleAlertsLog: function()
    {
        var alink = $('alertsloglink').down('A'),
            div = $('hordeAlertslog').down('DIV'),
            opts = { duration: 0.5, queue: { position: 'end', scope: 'hordeAlertslog', limit: 2} };

        if (div.visible()) {
            Effect.BlindUp(div, opts);
            alink.update(DIMP.text.showalog);
        } else {
            Effect.BlindDown(div, opts);
            alink.update(DIMP.text.hidealog);
        }
    },

    removeAlert: function(effect)
    {
        try {
            var elt = $(effect.element),
                parent = elt.up();

            elt.remove();
            if (!parent.childElements().size() &&
                parent.readAttribute('id') == 'hordeIE6AlertsFix') {
                parent.remove();
            }
        } catch (e) {
            this.debug('removeAlert', e);
        }
    },

    compose: function(type, args)
    {
        var url = DIMP.conf.compose_url;
        args = args || {};
        if (type) {
            args.type = type;
        }
        this.popupWindow(this.addURLParam(url, args), 'compose' + new Date().getTime());
    },

    popupWindow: function(url, name)
    {
        if (!(window.open(url, name.replace(/\W/g, '_'), 'width=' + DIMP.conf.popup_width + ',height=' + DIMP.conf.popup_height + ',status=1,scrollbars=yes,resizable=yes'))) {
            this.showNotifications([ { type: 'horde.warning', message: DIMP.text.popup_block } ]);
        }
    },

    closePopup: function()
    {
        // Mozilla bug/feature: it will not close a browser window
        // automatically if there is code remaining to be performed (or, at
        // least, not here) unless the mouse is moved or a keyboard event
        // is triggered after the callback is complete. (As of FF 2.0.0.3 and
        // 1.5.0.11).  So wait for the callback to complete before attempting
        // to close the window.
        if (this.inAjaxCallback) {
            this.closePopup.bind(this).defer();
        } else {
            window.close();
        }
    },

    logout: function(url)
    {
        this.is_logout = true;
        this.redirect(url || (DIMP.conf.URI_IMP + '/LogOut'));
    },

    redirect: function(url)
    {
        url = this.addURLParam(url);
        if (parent.frames.horde_main) {
            parent.location = url;
        } else {
            window.location = url;
        }
    },

    /* Add dropdown menus to addresses. */
    buildAddressLinks: function(alist, elt)
    {
        var base, tmp,
            cnt = alist.size();

        if (cnt > 15) {
            tmp = $('largeaddrspan').cloneNode(true);
            tmp.writeAttribute('id', 'largeaddrspan_active');
            elt.insert(tmp);
            base = tmp.down('.dispaddrlist');
            tmp = tmp.down(1);
            tmp.setText(tmp.getText().replace('%d', cnt));
        } else {
            base = elt;
        }

        alist.each(function(o, i) {
            var a;
            if (o.raw) {
                a = o.raw;
            } else {
                a = new Element('A', { className: 'address', personal: o.personal, email: o.inner, address: (o.personal ? (o.personal + ' <' + o.inner + '>') : o.inner) });
                if (o.personal) {
                    a.writeAttribute({ title: o.inner }).insert(o.personal.escapeHTML());
                } else {
                    a.insert(o.inner.escapeHTML());
                }
                this.DMenu.addElement(a.identify(), 'ctx_contacts', { offset: a, left: true });
            }
            base.insert(a);
            if (i + 1 != cnt) {
                base.insert(', ');
            }
        }, this);

        return elt;
    },

    /* Removes event handlers from address links. */
    removeAddressLinks: function(id)
    {
        id.select('.address').each(function(elt) {
            this.DMenu.removeElement(elt.identify());
        }, this);
    },

    addURLParam: function(url, params)
    {
        var q = url.indexOf('?');
        params = $H(params);

        if (DIMP.conf.SESSION_ID) {
            params.update(DIMP.conf.SESSION_ID.toQueryParams());
        }

        if (q != -1) {
            params.update(url.toQueryParams());
            url = url.substring(0, q);
        }

        return params.size() ? (url + '?' + params.toQueryString()) : url;
    },

    reloadMessage: function(params)
    {
        if (typeof DimpFullmessage != 'undefined') {
            window.location = this.addURLParam(document.location.href, params);
        } else {
            DimpBase.loadPreview(null, params);
        }
    },

    /* Mouse click handler. */
    clickHandler: function(e)
    {
        if (e.isRightClick()) {
            return;
        }

        var elt = e.element(), id, opts, tmp;

        if (this.alertrequest) {
            this.alertsFade(this.alertrequest);
            this.alertrequest = null;
        }

        while (Object.isElement(elt)) {
            id = elt.readAttribute('id');

            switch (id) {
            case 'partlist_toggle':
                tmp = $('partlist');
                $('partlist_col', 'partlist_exp').invoke('toggle');
                opts = { duration: 0.2, queue: { position: 'end', scope: 'partlist', limit: 2 } };
                if (tmp.visible()) {
                    Effect.BlindUp(tmp, opts);
                } else {
                    Effect.BlindDown(tmp, opts);
                }
                e.stop();
                return;

            case 'msg_print':
                window.print();
                e.stop();
                return;

            case 'msg_view_source':
                this.popupWindow(this.addURLParam(DIMP.conf.URI_VIEW, { index: DIMP.conf.msg_index, mailbox: DIMP.conf.msg_folder, actionID: 'view_source', id: 0 }, true), DIMP.conf.msg_index + '|' + DIMP.conf.msg_folder);
                break;

            case 'alertsloglink':
                this.toggleAlertsLog();
                break;

            case 'hordeAlerts':
                this.alertsFade(elt);
                break;

            case 'largeaddrspan_active':
                tmp = elt.down();
                [ tmp.down(), tmp.down(1), tmp.next() ].invoke('toggle');
                break;

            default:
                // CSS class based matching
                if (elt.hasClassName('unblockImageLink')) {
                    IMP.unblockImages(e);
                } else if (elt.hasClassName('toggleQuoteShow')) {
                    [ elt, elt.next() ].invoke('toggle');
                    Effect.BlindDown(elt.next(1), { duration: 0.2, queue: { position: 'end', scope: 'showquote', limit: 2 } });
                } else if (elt.hasClassName('toggleQuoteHide')) {
                    [ elt, elt.previous() ].invoke('toggle');
                    Effect.BlindUp(elt.next(), { duration: 0.2, queue: { position: 'end', scope: 'showquote', limit: 2 } });
                } else if (elt.hasClassName('pgpVerifyMsg')) {
                    elt.replace(DIMP.text.verify);
                    DimpCore.reloadMessage({ pgp_verify_msg: 1 });
                    e.stop();
                } else if (elt.hasClassName('smimeVerifyMsg')) {
                    elt.replace(DIMP.text.verify);
                    DimpCore.reloadMessage({ smime_verify_msg: 1 });
                    e.stop();
                }
                break;
            }

            elt = elt.up();
        }
    },

    // By default, no context onShow action
    contextOnShow: Prototype.emptyFunction,

    contextOnClick: function(id, elt)
    {
        switch (id) {
        case 'ctx_contacts_new':
            this.compose('new', { to: elt.readAttribute('address') });
            break;

        case 'ctx_contacts_add':
            this.doAction('AddContact', { name: elt.readAttribute('personal'), email: elt.readAttribute('email') }, null, true);
            break;
        }
    },

    /* DIMP initialization function. */
    init: function()
    {
        if (typeof ContextSensitive != 'undefined') {
            this.DMenu = new ContextSensitive({ onClick: this.contextOnClick.bind(this), onShow: this.contextOnShow.bind(this) });
        }

        /* Don't do additional onload stuff if we are in a popup. We need a
         * try/catch block here since, if the page was loaded by an opener
         * out of this current domain, this will throw an exception. */
        try {
            if (parent.opener &&
                parent.opener.location.host == window.location.host &&
                parent.opener.DimpCore) {
                DIMP.baseWindow = parent.opener.DIMP.baseWindow || parent.opener;
            }
        } catch (e) {}

        /* Remove unneeded buttons. */
        if (!DIMP.conf.spam_reporting) {
            this.buttons = this.buttons.without('button_spam');
        }
        if (!DIMP.conf.ham_reporting) {
            this.buttons = this.buttons.without('button_ham');
        }

        /* Add click handler. */
        document.observe('click', DimpCore.clickHandler.bindAsEventListener(DimpCore));
    }

};

/* Helper methods for setting/getting element text without mucking
 * around with multiple TextNodes. */
Element.addMethods({
    setText: function(element, text)
    {
        var t = 0;
        $A(element.childNodes).each(function(node) {
            if (node.nodeType == 3) {
                if (t++) {
                    Element.remove(node);
                } else {
                    node.nodeValue = text;
                }
            }
        });

        if (!t) {
            $(element).insert(text);
        }
    },

    getText: function(element, recursive)
    {
        var text = '';
        $A(element.childNodes).each(function(node) {
            if (node.nodeType == 3) {
                text += node.nodeValue;
            } else if (recursive && node.hasChildNodes()) {
                text += $(node).getText(true);
            }
        });
        return text;
    }
});

/* Create some utility functions. */
Object.extend(Array.prototype, {
    // Need our own diff() function because prototypejs's without() function
    // does not handle array input.
    diff: function(values)
    {
        return this.select(function(value) {
            return !values.include(value);
        });
    },
    numericSort: function()
    {
        return this.collect(Number).sort(function(a,b) {
            return (a > b) ? 1 : ((a < b) ? -1 : 0);
        });
    }
});

Object.extend(String.prototype, {
    // We define our own version of evalScripts() to make sure that all
    // scripts are running in the same scope and that all functions are
    // defined in the global scope. This is not the case when using
    // prototype's evalScripts().
    evalScripts: function()
    {
        var re = /function\s+([^\s(]+)/g;
        this.extractScripts().each(function(s) {
            var func;
            eval(s);
            while (func = re.exec(s)) {
                window[func[1]] = eval(func[1]);
            }
        });
    }
});
