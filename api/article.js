var listArticle = jsGen.lib.json.ListArticle,
    comment = jsGen.lib.json.Comment,
    union = jsGen.lib.tools.union,
    intersect = jsGen.lib.tools.intersect,
    checkID = jsGen.lib.tools.checkID,
    checkUrl = jsGen.lib.tools.checkUrl,
    articleCache = jsGen.cache.article,
    commentCache = jsGen.cache.comment,
    listCache = jsGen.cache.list,
    filterTitle = jsGen.lib.tools.filterTitle,
    filterSummary = jsGen.lib.tools.filterSummary,
    filterContent = jsGen.lib.tools.filterContent;

articleCache.getArticle = function(ID, callback, convert) {
    var that = this,
        doc = this.get(ID);

    function getConvert(doc) {
        doc.tagsList = jsGen.api.tag.convertTags(doc.tagsList);
        doc.author = jsGen.api.user.convertUsers(doc.author);
        doc.favorsList = jsGen.api.user.convertUsers(doc.favorsList);
        doc.opposesList = jsGen.api.user.convertUsers(doc.opposesList);
        doc.collectorsList = jsGen.api.user.convertUsers(doc.collectorsList);
    };
    callback = callback || jsGen.lib.tools.callbackFn;
    if (convert === undefined) convert = true;
    if (doc) {
        doc.hots = cache[ID].hots;
        doc.visitors = cache[ID].visitors;
        if (convert) {
            getConvert(doc);
            convertArticles(doc.commentsList, callback, 'comment');
        } else return callback(null, doc);
    } else jsGen.dao.article.getArticle(jsGen.dao.article.convertID(ID), function(err, doc) {
        if (doc) {
            doc._id = ID;
            that.put(ID, doc);
            if (convert) {
                getConvert(doc);
                convertArticles(doc.commentsList, callback, 'comment');
            }
        }
        return callback(err, doc);
    });
};

commentCache.getArticle = function(ID, callback, convert) {
    var that = this,
        doc = this.get(ID);

    function getConvert(doc) {
        doc.author = jsGen.api.user.convertUsers(doc.author);
        doc.favorsList = jsGen.api.user.convertUsers(doc.favorsList);
        doc.opposesList = jsGen.api.user.convertUsers(doc.opposesList);
    };
    callback = callback || jsGen.lib.tools.callbackFn;
    if (convert === undefined) convert = true;
    if (doc) {
        if (convert) {
            getConvert(doc);
            convertArticles(doc.commentsList, callback, 'comment');
        } else return callback(null, doc);
    } else jsGen.dao.article.getArticle(jsGen.dao.article.convertID(ID), function(err, doc) {
        if (doc) {
            doc._id = ID;
            doc = intersect(union(comment), doc);
            that.put(ID, doc);
            if (convert) {
                getConvert(doc);
                convertArticles(doc.commentsList, callback, 'comment');
            }
        }
        return callback(err, doc);
    });
};

listCache.getArticle = function(ID, callback, convert) {
    var that = this,
        doc = this.get(ID);

    function getConvert() {
        doc.tagsList = jsGen.api.tag.convertTags(doc.tagsList);
        doc.author = jsGen.api.user.convertUsers(doc.author);
    };
    callback = callback || jsGen.lib.tools.callbackFn;
    if (convert === undefined) convert = true;
    if (doc) {
        if (convert) getConvert(doc);
        doc.hots = cache[ID].hots;
        doc.visitors = cache[ID].visitors;
        return callback(null, doc);
    } else jsGen.dao.article.getArticle(jsGen.dao.article.convertID(ID), function(err, doc) {
        if (doc) {
            doc._id = ID;
            doc.content = filterSummary(jsGen.module.marked(doc.content));
            doc = intersect(union(listArticle), doc);
            that.put(ID, doc);
            if (convert) getConvert(doc);
        }
        return callback(err, doc);
    });
};

var cache = {
    _initTime: 0,
    _index: []
};
cache._update = function(obj) {
    if (!this[obj._id]) {
        this[obj._id] = {};
        if (obj.status > -1) this._index.push(obj._id);
        this._initTime = Date.now();
    }
    this[obj._id].display = obj.display;
    this[obj._id].status = obj.status;
    this[obj._id].updateTime = obj.updateTime;
    this[obj._id].hots = obj.hots;
    this[obj._id].visitors = obj.visitors;
    if (obj.status === 2) {
        this._index.splice(this._index.lastIndexOf(obj._id), 1);
        this._index.push(obj._id);
    }
    if (obj.display === 2) {
        this._index.splice(this._index.lastIndexOf(obj._id), 1);
    }
    return this;
};
cache._remove = function(ID) {
    delete this[ID];
    this._index.splice(this._index.indexOf(ID), 1);
    this._initTime = Date.now();
    return this;
};
(function() {
    var that = this;
    jsGen.dao.article.getArticlesIndex(function(err, doc) {
        if (err) throw err;
        if (doc) {
            doc._id = jsGen.dao.article.convertID(doc._id);
            that._update(doc);
        }
    });
}).call(cache);

function convertArticles(_idArray, callback, mode) {
    var result = [];
    if (!Array.isArray(_idArray)) _idArray = [_idArray];
    if (_idArray.length === 0) return callback(null, result);
    _idArray.reverse();
    next();

    function next() {
        var ID = _idArray.pop();
        if (!ID) return callback(null, tags);
        if (mode === 'comment') {
            commentCache.getArticle(ID, function(err, doc) {
                if (err) return callback(err, result);
                if (doc) result.push(doc);
                next();
            });
        } else listCache.getArticle(ID, function(err, doc) {
            if (err) return callback(err, result);
            if (doc) result.push(doc);
            next();
        });
    }
};

function getArticle(req, res, dm) {
    var ID = req.path[2];
    if (!checkID(ID) || !cache[ID]) throw jsGen.Err(jsGen.lib.msg.articleNone);
    if (cache[ID].display > 0 && !req.session.Uid) throw jsGen.Err(jsGen.lib.msg.userNeedLogin);
    articleCache.getArticle(ID, dm.intercept(function(doc) {
        if (req.session.Uid === doc.author._id) return res.sendjson(doc);
        if (cache[ID].display === 1) {
            jsGen.cache.user.getUser(doc.author._id, dm.intercept(function(user) {
                if (user.fansList.indexOf(jsGen.dao.user.convertID(req.session.Uid)) >= 0) return res.sendjson(doc);
                else throw jsGen.Err(jsGen.lib.msg.articleDisplay1);
            }), false);
        } else if (cache[ID].display === 2) {
            if (req.session.role === 'admin' || req.session.role === 'editor') return res.sendjson(doc);
            else throw jsGen.Err(jsGen.lib.msg.articleDisplay2);
        } else return res.sendjson(doc);
    }));
};

function getLatest(req, res, dm) {
    var array = [],
        p = req.getparam.p || req.getparam.page,
        n = req.getparam.n || req.getparam.num,
        body = {
            pagination: {},
            data: []
        };

    if (!req.session.pagination) {
        req.session.pagination = {
            pagID: 'a' + cache._initTime,
            total: cache._index.length,
            num: 20,
            now: 1
        };
        jsGen.cache.pagination.put(req.session.pagination.pagID, cache._index);
    }
    if (n && n >= 1 && n <= 100) req.session.pagination.num = Math.floor(n);
    if (p && p >= 1) req.session.pagination.now = Math.floor(p);
    p = req.session.pagination.now;
    n = req.session.pagination.num;
    array = jsGen.cache.pagination.get(req.session.pagination.pagID);
    if (!array || (p === 1 && req.session.pagination.pagID !== 'a' + cache._initTime)) {
        req.session.pagination.pagID = 'a' + cache._initTime;
        req.session.pagination.total = cache._index.length;
        jsGen.cache.pagination.put(req.session.pagination.pagID, cache._index);
        array = cache._index;
    }
    array = array.slice((p - 1) * n, p * n);
    body.pagination.total = req.session.pagination.total;
    body.pagination.now = p;
    body.pagination.num = n;
    next();

    function next() {
        var ID = array.pop();
        if (!ID) return res.sendjson(body);
        listCache.getArticle(ID, dm.intercept(function(doc) {
            if (doc) body.data.push(doc);
            next();
        }));
    };
};

function checkArticle(articleObj, callback) {
    var newObj = {
        _id: 0,
        date: 0,
        display: 0,
        status: 0,
        refer: '',
        title: '',
        cover: '',
        content: '',
        updateTime: 0,
        tagsList: [''],
        comment: true
    };
    callback = callback || jsGen.lib.tools.callbackFn;
    intersect(newObj, req.apibody);
    newObj.title = filterTitle(newObj.title);
    if (!newObj.title) return callback(jsGen.lib.msg.titleMinErr, null);
    newObj.content = filterContent(newObj.content);
    if (!newObj.content) return callback(jsGen.lib.msg.articleMinErr, null);
    if (newObj.cover && !checkUrl(newObj.cover)) return callback(jsGen.lib.msg.coverErr, null);
    if (newObj.refer && (!checkID('/A', newObj.refer) || !checkUrl(newObj.refer))) delete newObj.refer;
    if (newObj.tagsList) {
        jsGen.api.tag.filterTags(newObj.tagsList.slice(0, jsGen.config.ArticleTagsMax), function(err, doc) {
            if (err) return callback(err, null);
            if (doc) newObj.tagsList = doc;
            if (!newObj._id) return callback(null, newObj);
            articleCache.getArticle(newObj._id, function(err, doc) {
                if (err) return callback(err, null);
                var tagList = {},
                setTagList = [];
                if (doc) doc.tagsList.forEach(function(x) {
                    tagList[x] = -newObj._id;
                });
                newObj.tagsList.forEach(function(x) {
                    if (tagList[x]) delete tagList[x];
                    else tagList[x] = newObj._id;
                });
                for (var key in tagList) setTagList.push({
                    _id: Number(key),
                    articlesList: tagList[key]
                });
                setTagList.forEach(function(x) {
                    jsGen.api.tag.setTag(x);
                });
                return callback(null, newObj);
            }, false);
        });
    } else return callback(null, newObj);
};

function addArticle(req, res, dm) {
    var newObj = {
        date: 0,
        display: 0,
        status: 0,
        refer: '',
        title: '',
        cover: '',
        content: '',
        updateTime: 0,
        tagsList: [''],
        comment: true
    };
    if (!req.session.Uid) throw jsGen.Err(jsGen.lib.msg.userNeedLogin);
    if (req.session.role === 'guest') throw jsGen.Err(jsGen.lib.msg.userRoleErr);
    intersect(newObj, req.apibody);
    newObj.date = Date.now();
    newObj.updateTime = newObj.date;
    if (newObj.display !== 1) newObj.display = 0;
    newObj.status = 0;
    newObj.author = jsGen.dao.user.convertID(req.session.Uid);
    newObj.title = filterTitle(newObj.title);
    if (!newObj.title) throw jsGen.Err(jsGen.lib.msg.titleMinErr);
    newObj.content = filterContent(newObj.content);
    if (!newObj.content) throw jsGen.Err(jsGen.lib.msg.articleMinErr);
    if (newObj.cover && !checkUrl(newObj.cover)) throw jsGen.Err(jsGen.lib.msg.coverErr);
    if (newObj.refer && (!checkID('/A', newObj.refer) || !checkUrl(newObj.refer))) delete newObj.refer;

    if (newObj.tagsList) {
        jsGen.api.tag.filterTags(newObj.tagsList.slice(0, jsGen.config.ArticleTagsMax), dm.intercept(function(doc) {
            if (doc) userObj.tagsList = doc;
            userCache.getUser(req.session.Uid, dm.intercept(function(doc) {
                var tagList = {},
                setTagList = [];
                if (doc) doc.tagsList.forEach(function(x) {
                    tagList[x] = -userObj._id;
                });
                userObj.tagsList.forEach(function(x) {
                    if (tagList[x]) delete tagList[x];
                    else tagList[x] = userObj._id;
                });
                for (var key in tagList) setTagList.push({
                    _id: Number(key),
                    usersList: tagList[key]
                });
                setTagList.forEach(function(x) {
                    jsGen.api.tag.setTag(x);
                });
                daoExec();
            }), false);
        }));
    } else daoExec();

    function daoExec() {
        jsGen.dao.user.setUserInfo(userObj, dm.intercept(function(doc) {
            if (doc) {
                doc._id = req.session.Uid;
                body = union(UserPrivateTpl);
                body = intersect(body, doc);
                setCache(body);
                var tagsList = jsGen.api.tag.convertTags(body.tagsList);
                body = intersect(defaultObj, body);
                body.tagsList = tagsList;
                return res.sendjson(body);
            }
        }));
    };


};

function setArticle(req, res, dm) {
    var newObj = {
        date: 0,
        display: 0,
        status: 0,
        refer: '',
        title: '',
        cover: '',
        content: '',
        updateTime: 0,
        comment: true
    };
    if (!req.session.Uid) throw jsGen.Err(jsGen.lib.msg.userNeedLogin);
    if (req.session.role === 'guest') throw jsGen.Err(jsGen.lib.msg.userRoleErr);
    intersect(newObj, req.apibody);
    newObj.date = Date.now();
    newObj.updateTime = newObj.date;
    newObj.content = filterContent(newObj.content);
    if (!newObj.content) throw jsGen.Err(jsGen.lib.msg.articleMinErr);
    if (checkID('/A', newObj.refer)) {
        var ID = newObj.refer.slice(1);
        if (!cache[ID]) throw jsGen.Err(jsGen.lib.msg.articleNone);
    } else {

    }

};

function getFn(req, res, dm) {
    switch (req.path[2]) {
        case undefined:
        case 'index':
            return getLatest(req, res, dm);
        case 'hot':
            return getHot(req, res, dm);
        case 'update':
            return getUpdate(req, res, dm);
        default:
            return getArticle(req, res, dm);
    }
};

function postFn(req, res, dm) {
    switch (req.path[2]) {
        case undefined:
        case 'index':
            return addArticle(req, res, dm);
        default:
            return setArticle(req, res, dm);
    }
};

function deleteFn(req, res) {};

module.exports = {
    GET: getFn,
    POST: postFn,
    DELETE: deleteFn,
    convertArticles: convertArticles
};
