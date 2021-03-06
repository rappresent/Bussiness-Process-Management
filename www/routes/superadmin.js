var namescape = "superadmin";
var page = require('express').Router();
var api = require('express').Router();
var httpCode = require('http').STATUS_CODES;
//
module.exports = function (args, app) {
    var global = args.global;
    var locals = args.locals;
    var worker = args.worker;
    var account = args.account;
    var mongoose = args.mongoose;
    var home = global.home;
    //
    var maxLimit = 50;
    var Authorize = require(home + "authorize");
    var Collection = (function () {
        var o = {};
        var models = mongoose.models;
        for (var m in models) o[models[m].collection.name] = mongoose.models[m];
        return o;
    })();
    var authorize = new Authorize({
        models: Collection
    });
    //
    /** **************************************************************************
     ** http data resource
     ** **************************************************************************/
    api.use(function (req, res, next) {

        var finalfunc = function (res, data) {
            var body = {
                "status": 1,
                "data": data,
            };
            res.status(200).send(body);
        }
        var errfunc = function (res, e) {
            console.log(e);
            var body = {
                "status": 0,
                "message": e,
            };
            res.status(200).send(body);
        }
        var pathname = req._parsedUrl.pathname;
        var org = req.logged.user.organizations;
        var orgId = org._id;
        var collname = (pathname.split("/")[1] || "").toLowerCase();
        if (Collection.hasOwnProperty(collname)) {
            var rule = authorize.setRule({
                groups: {
                    "name": {
                        "$nin": ["Root", "Public"]
                    }
                },
                organizations: {
                    "_id": orgId
                },
                posts: {
                    "organizations._id": orgId,
                    "assignTo.roles._id": {
                        $exists: false
                    }
                },
                categories: null,
                roles: null,
                procedures: null,
                steps: null,
                users: null
            });
            if (rule.hasOwnProperty(collname)) {
                var model = Collection[collname];
                var popQuery = (function () {
                    if (model.getPopQuery) {
                        var populate = model.getPopQuery(-1);
                        if (!Object.keys(populate).length) return "";
                        return populate;
                    }
                    return "";
                })();
                if (collname == "organizations" || collname == "groups") {
                    req.logged.populate = (function () {
                        var foreign = mongoose.nested(popQuery, -1);
                        if (!Object.keys(foreign).length) return "";
                        return foreign;
                    })();
                    next();
                } else {
                    authorize.setPopulation(popQuery);
                    authorize.init(function (nested) {
                        req.logged.populate = nested;
                        next();
                    }, function (e) {
                        next(e);
                    });
                }
            } else {
                var error = ("collname|String").split("|");
                var Err = new Error([httpCode[403], collname].join(" : "));
                Err.errors = {
                    require: error[0],
                    type: error[1],
                    founded: eval(error[0])
                };
                next(Err);
            }
        } else if (!collname) {
            next();
        } else {
            //custom APIs

            switch (collname) {
                case 'getsteps':
                    var procId = req.param('procedure_id');
                    var Procedure = Collection['procedures'];
                    Procedure.findOne({
                        "_id": procId,
                        active: true
                    }).then(function (doc) {
                        if (doc !== null) {
                            var Step = Collection['steps'];
                            Step.find({
                                "procedures._id": procId,
                                active: true
                            }).then(function (docs) {
                                var body = {
                                    "status": 1,
                                    "data": docs,
                                };
                                res.status(200).send(body);
                            })
                            .catch(function (e) {
                                console.log(e);
                                var body = {
                                    "status": 0,
                                    "message": e,
                                };
                                res.status(200).send(body);
                            });

                        } else {
                            var body = {
                                "status": 0,
                                "message": "invalid procedure id",
                            };
                            res.status(200).send(body);
                        }
                    }).catch(function (e) {
                        console.log(e);
                        var body = {
                            "status": 0,
                            "message": e,
                        };
                        res.status(200).send(body);
                    });

                    break;

                case 'alldashboarddata':

                    var Post = Collection['posts'];
                    var Organization = Collection['organizations'];
                    var data = {};

                    // get organizagtion latlong
                    Organization.findOne({
                        "_id": req.logged.user.organizations._id
                    }).then(function(doc){
                        data.orglocationlat = doc.location.lat;
                        data.orglocationlong = doc.location.long;
                    }).catch(function(e){
                        errfunc(e);
                    });
                    // all incoming reports
                    Post.find({
                        "organizations._id": req.logged.user.organizations._id,
                        active: true,
                        $or: [{"static": false}, {"static": {$exists: false}}],
                    }, 'text lat long')
                    .then(function (docs) {
                        data.allreportltlng = docs;

                        // finished reports
                        return Post.find({
                            "organizations._id": req.logged.user.organizations._id,
                            active: true,
                            $or: [{"static": false}, {"static": {$exists: false}}],
                            finished: true
                        }, 'text lat long').then(function (docs2) {
                            data.finishedreportltlng = docs2;

                            // reports on progress
                            return Post.find({
                                "organizations._id": req.logged.user.organizations._id,
                                active: true,
                                finished: false,
                                $or: [{"static": false}, {"static": {$exists: false}}],
                                "assignTo": {$exists: true},
                                "assignTo.implementor": {$exists: true},
                                rejected: {$exists: false}
                            }, 'text lat long').then(function (docs3) {
                                data.onprogressreportltlng = docs3;

                                // accepted reports

                                return Post.find({
                                    "organizations._id": req.logged.user.organizations._id,
                                    active: true,
                                    finished: false,
                                    $or: [{"static": false}, {"static": {$exists: false}}],
                                    "assignTo": {$exists: true},
                                    "assignTo.implementor": {$exists: false},
                                    rejected: {$exists: false}
                                }, 'text lat long').then(function (docs4) {
                                    data.acceptedreportltlng = docs4;

                                    // rejected reports
                                    return Post.find({
                                        "organizations._id": req.logged.user.organizations._id,
                                        active: true,
                                        finished: false,
                                        $or: [{"static": false}, {"static": {$exists: false}}],
                                        rejected: {$exists: true}
                                    }, 'text lat long').then(function (docs5) {
                                        data.rejectedreportltlng = docs5;
                                        
                                        // incoming reports
                                        return Post.find({
                                            "organizations._id": req.logged.user.organizations._id,
                                            active: true,
                                            finished: false,
                                            $or: [{"static": false}, {"static": {$exists: false}}],
                                            "assignTo": {$exists: false},
                                            rejected: {$exists: false}
                                        }, 'text lat long').then(function (docs6) {
                                            data.incomingreportltlng = docs6;
                                            var orgid = mongoose.Types.ObjectId(req.logged.user.organizations._id);
                                            // aggregate by category
                                            return Post.aggregate([
                                                {
                                                    $match: {
                                                        $and: [
                                                            {active: true},
                                                            {"organizations._id": orgid}
                                                        ]
                                                    }
                                                },
                                                {
                                                    $group: {
                                                        _id: '$categories._id',
                                                        sum: {$sum: 1}
                                                    }
                                                },
                                                {
                                                    $lookup: {
                                                        "from": "categories",
                                                        "localField": "_id",
                                                        "foreignField": "_id",
                                                        "as": "category"
                                                    }
                                                },
                                            ]).then(function (docs7) {
                                                data.categoryagg = docs7;
    
                                                // aggregate by month
                                                var currentYear = new Date();
                                                var lowerLimit = new Date(currentYear.getFullYear()-1, currentYear.getMonth()+1, 0, 23, 59, 59);
                                                return Post.aggregate([
                                                    {
                                                        $match: {
                                                            $and: [
                                                                {createdAt: { $lt: currentYear, $gt: lowerLimit }}, // Get results from start of current month to current time.
                                                                {active: true},
                                                                {"organizations._id": orgid}
                                                            ]
                                                        }
                                                    },
                                                    {
                                                        $group: {
                                                            _id: {year: {$year: "$createdAt"}, month: {$month: "$createdAt"}},
                                                            sum: {$sum: 1}
                                                        }
                                                    }
                                                ])
                                                .then(function (doc8) {
                                                    var aggData = [];
                                                    // before injecting the data, set other month values with 0
    
                                                    // loop through months
                                                    for (m = 1; m <= 12; m++) {
                                                        var realM;    
                                                        var realYear;
                                                        
                                                        if((m+currentYear.getMonth()+1) > 12){
                                                            // so if the month offset is bigger than 12, set back to current month year; 
                                                            realM = currentYear.getMonth()+1;
                                                            realYear = currentYear.getFullYear();
                                                        } else {
                                                            // if not, then set month + offset and set in previous year
                                                            realM = m+currentYear.getMonth()+1;
                                                            realYear = currentYear.getFullYear()-1;
                                                        }
                                                        var monthExist = doc8.filter(function (obj) {
                                                            return obj._id.month == realM;
                                                        });
                                                        if (monthExist.length === 0) {
                                                            aggData.push({
                                                                _id: {
                                                                    month: realM,
                                                                    year: realYear
                                                                },
                                                                sum: 0
                                                            });
                                                        } else {
                                                            aggData.push(monthExist[0]);
                                                        }
                                                    }
                                                    data.monthlyreports = aggData;
                                                    var monthOffset = currentYear.getMonth()+1 > 11 ? 0 : currentYear.getMonth()+1;  
                                                    data.monthlyreportoffset = monthOffset;
                                                    return finalfunc(res, data);
    
                                                }).catch(function (e) { 
                                                    console.log('error at query 8');
                                                    return errfunc(res, e);
                                                });
    
                                            }).catch(function (e) {
                                                console.log('error at query 7');
                                                errfunc(res, e);
                                            });
                                        })
                                        .catch(function(e){
                                            console.log('error at query 6');
                                            errfunc(res, e);
                                        });
                                        
                                    }).catch(function (e) {
                                        console.log('error at query 5');
                                        errfunc(res, e);
                                    });
                                }).catch(function (e) {
                                    console.log('error at query 4');
                                    errfunc(res, e);
                                });
                            }).catch(function (e) {
                                console.log('error at query 3');
                                errfunc(res, e);
                            });
                        }).catch(function (e) {
                            console.log('error at query 2');
                            errfunc(res, e);
                        });
                    }).catch(function (e) {
                        console.log('error at query 1');
                        errfunc(res, e);
                    });
                    break;

                case "kpi":
                    var data = {};
                    var Post = Collection['posts'];

                    // look for assigned reports
                    Post.find({
                        "organizations._id": req.logged.user.organizations._id,
                        active: true,
                        finished: false,
                        "assignTo": {$exists: true},
                        "assignTo.implementor": {$exists: false},
                        $or: [{"static": false}, {"static": {$exists: false}}],
                        rejected: {$exists: false}
                    })
                    .then(function (docs) {
                        var timeSum = 0;
                        var highestData = 0;
                        for (var i = 0; i < docs.length; i++) {
                            var time1 = new Date(docs[i].createdAt);
                            var time2 = new Date(docs[i].assignTo.createdAt);
                            var interval = time2.getTime() - time1.getTime();
                            if (highestData < interval) {
                                highestData = interval;
                            }
                            timeSum = timeSum + interval;
                        }

                        var totalData = docs.length !== 0 ? docs.length : 1;
                        var avgInterval = timeSum / totalData;
                        data.assigned = {
                            avg: ((avgInterval / 1000) / 60) / 60, // change in hour
                            high: ((highestData / 1000) / 60) / 60,
                        };
                        // look for on progress reports
                        return Post.find({
                            "organizations._id": req.logged.user.organizations._id,
                            active: true,
                            finished: false,
                            "assignTo": {$exists: true},
                            "assignTo.implementor": {$exists: true},
                            $or: [{"static": false}, {"static": {$exists: false}}],
                            rejected: {$exists: false}
                        })
                        .then(function (docs2) {
                            var timeSum = 0;
                            var highestData = 0;
                            for (var i = 0; i < docs2.length; i++) {
                                var time1 = new Date(docs2[i].assignTo.createdAt);
                                var time2 = new Date(docs2[i].assignTo.implementor.createdAt);
                                var interval = time2.getTime() - time1.getTime();
                                if (highestData < interval) {
                                    highestData = interval;
                                }
                                timeSum = timeSum + interval;
                            }
                            var totalData = docs2.length !== 0 ? docs2.length : 1;
                            var avgInterval = timeSum / totalData;
                            data.onprogress = {
                                avg: ((avgInterval / 1000) / 60) / 60, // change in hour
                                high: ((highestData / 1000) / 60) / 60,
                            };
                            // look for on finished reports
                            return Post.find({
                                "organizations._id": req.logged.user.organizations._id,
                                active: true,
                                finished: true
                            })
                            .then(function (docs3) {
                                var timeSum = 0;
                                var highestData = 0;
                                for (var i = 0; i < docs3.length; i++) {
                                    var time1 = new Date(docs3[i].assignTo.implementor.createdAt);
                                    var time2 = new Date(docs3[i].statuses[docs3[i].statuses.length - 1].createdAt);
                                    var interval = time2.getTime() - time1.getTime();
                                    if (highestData < interval) {
                                        highestData = interval;
                                    }
                                    timeSum = timeSum + interval;
                                }
                                var totalData = docs3.length !== 0 ? docs3.length : 1;
                                var avgInterval = timeSum / totalData;
                                data.finished = {
                                    avg: ((avgInterval / 1000) / 60) / 60, // change in hour
                                    high: ((highestData / 1000) / 60) / 60,
                                };
                                return finalfunc(res, data);
                            })
                            .catch(function (e) {
                                return errfunc(res, e);
                            });
                        })
                        .catch(function (e) {
                            return errfunc(res, e);
                        });
                    })
                    .catch(function (e) {
                        return errfunc(res, e);
                    });
                    break;

                case "monthlyreports":
                    var currentDate = new Date();
                    var currentYear = currentDate.getFullYear();
                    var m = parseInt(req.param('m'));
                    if(m > currentDate.getMonth()){
                        // this means the client has requested month ahead of current month, which means it's in the previous year
                        currentYear = currentYear-1; 
                    }
                    var Post = Collection['posts'];
                    var query = {
                        "organizations._id": req.logged.user.organizations._id,
                        active: true,
                        "createdAt": {
                            "$gte": new Date(Date.UTC(currentYear, m, 1, 0, 0, 0)),
                            "$lt": new Date(Date.UTC(currentYear, (m + 1), 1, 0, 0, 0))
                        }
                    };
                    Post.find(query)
                    .populate({path: 'users._id', select: 'name'})
                    .then(function (docs) {
                        var body = {
                            "status": 1,
                            "data": docs,
                            "query": query
                        };
                        return res.status(200).send(body);
                    }).catch(function (e) {
                        var body = {
                            "status": 0,
                            "message": e,
                        };
                        return res.status(200).send(body);
                    });
                    break;

                case "reportdetail":
                    var postid = req.param('postid');
                    var Post = Collection['posts'];
                    Post.findOne({
                        "organizations._id": req.logged.user.organizations._id,
                        _id: postid,
                        active: true
                    })
                    .populate({path: 'users._id', select: 'name'}).populate({path: 'media._ids', select: 'directory type'})
                    .populate({path: 'statuses.steps._id', select: 'procedures._id name'})
                    .populate({path: 'statuses.media._id', select: 'directory'})
                    .then(function (doc) {
                        if (doc.statuses.length > 0) {
                            var Step = Collection['steps'];
                            Step.find({
                                "procedures._id": doc.statuses[0].steps._id.procedures._id,
                                active: true
                            })
                            .populate({path: 'procedures._id', select: 'name'})
                            .sort({stepNumber: 1})
                            .then(function (doc2) {
                                var body = {
                                    "status": 1,
                                    "data": doc,
                                    "steps": doc2
                                };
                                res.status(200).send(body);
                            })
                            .catch(function (e) {
                                console.log('error at step query');
                                console.log(e);
                                var body = {
                                    "status": 0,
                                    "message": e,
                                };
                                res.status(200).send(body);
                            });
                        } else {
                            var body = {
                                "status": 1,
                                "data": doc,
                                "steps": []
                            };
                            res.status(200).send(body);
                        }
                    })
                    .catch(function (e) {
                        var body = {
                            "status": 0,
                            "message": e,
                        };
                        res.status(200).send(body);
                    });
                    break;
                default:
                    var error = ("collname|String").split("|");
                    var Err = new Error([httpCode[404], collname].join(" : "));
                    Err.errors = {
                        require: error[0],
                        type: error[1],
                        founded: eval(error[0])
                    };
                    next(Err);
                    break;
            }
        }
    })
    api.all('/', function (req, res) {
        res.send({
            status: 200,
            message: httpCode[200],
            error: null,
            data: req.logged.user
        });
    });

    api.get('/:collection', function (req, res, next) {
        var populate = req.logged.populate;
        var org = req.logged.user.organizations;
        var orgId = org._id
        var collname = (req.params.collection || "").toLowerCase();
        var pop = Number(req.query.pop) || 1;
        var limit = Number(req.query.limit) || maxLimit;
        var page = Number(req.query.page) || 1;
        var sortBy = req.query.sort || "name";
        var direction = Number(req.query.direction) || 1;
        var skip = (page - 1) * limit;
        //
        var model = Collection[collname];
        var query = {
            active: true
        };

        if (collname == "organizations" || collname == "groups") {
            query = authorize.rule[collname];
            model.find(query)
            .populate(populate).lean().then(function (docs) {
                var rows = mongoose.normalize(docs).filter(function (doc) {
                    if (authorize.isCorrect(doc)) return 1;
                    return 0;
                });
                res.send({
                    status: 200,
                    message: httpCode[200],
                    error: null,
                    data: {
                        limit: limit,
                        page: page,
                        sort: {
                            [sortBy]: direction
                        },
                        total: rows.length,
                        rows: rows
                    }
                })
            })
            .catch(function (e) {
                next(e);
            });
        } else {
            model.find(query)
            .sort({
                [sortBy]: direction
            }).skip(skip).limit(limit) //TODO
            .populate(populate).lean().then(function (docs) {
                var rows = mongoose.normalize(docs).filter(function (doc) {
                    if (authorize.isCorrect(doc)) return 1;
                    return 0;
                });
                res.send({
                    status: 200,
                    message: httpCode[200],
                    error: null,
                    data: {
                        limit: limit,
                        page: page,
                        sort: {
                            [sortBy]: direction
                        },
                        total: rows.length,
                        rows: rows
                    }
                });
            })
            .catch(function (e) {
                next(e);
            });
        }
    });
    api.get('/:collection/:id', function (req, res, next) {
        var populate = req.logged.populate;
        var collname = (req.params.collection || "").toLowerCase();
        var id = req.params.id;
        var pop = Number(req.query.pop) || 1;
        var model = Collection[collname];
        model.findOne({
            _id: id,
            active: true
        })
        .populate(populate).lean().then(function (docs) {
            var row = mongoose.normalize(docs);
            var is = authorize.isCorrect(row);
            if (is) {
                res.send({
                    status: 200,
                    message: httpCode[200],
                    error: null,
                    data: row
                });
            } else {
                var error = ("req.params|String").split("|");
                var Err = new Error([httpCode[403], id].join(" : "));
                Err.errors = {
                    require: error[0],
                    type: error[1],
                    founded: eval(error[0])
                };
                next(Err);
            }
        })
        .catch(function (e) {
            next(e);
        });
    });
    api.post('/:collection', function (req, res, next) {
        var collname = (req.params.collection || "").toLowerCase();
        var model = Collection[collname];
        var data = new model(req.body);
        //todo : checking foreign id that given from
        data.save().then(function (docs) {
            var rows = mongoose.normalize(docs);
            res.send({
                status: 200,
                message: httpCode[200],
                error: null,
                data: rows
            });
        }).catch(function (e) {
            next(e);
        });
    });
    api.put('/:collection/:id', function (req, res, next) {
        var notError = true;
        var populate = req.logged.populate;
        var collname = (req.params.collection || "").toLowerCase();
        var id = req.params.id;
        var pop = Number(req.query.pop) || 1;
        var model = Collection[collname];
        var isAllow = function (callback) {
            model.findOne({
                _id: id,
                // "$or" : [
                //     {restricted : {"$exists" : false}},
                //     {restricted : {"$ne" : true}}
                // ],
                restricted: {"$ne": true},
                active: true
            })
            .populate(populate).lean().then(function (docs) {
                var row = mongoose.normalize(docs);
                var is = authorize.isCorrect(row);
                var code = null;
                //
                if (!docs || !is) code = 404;
                else if (docs.restricted) code = 403;
                //
                if (code) {
                    var error = ("req.params|String").split("|");
                    var Err = new Error([httpCode[code], id].join(" : "));
                    Err.errors = {
                        require: error[0],
                        type: error[1],
                        founded: eval(error[0])
                    };
                    next(Err);
                    return 0;
                } else {
                    callback(row);
                    return 0;
                }
            })
            .catch(function (e) {
                callback(e);
                return 0;
            });
        };
        if (id) {
            isAllow(function (row) {
                //Validation block : start.
                var body = req.body;
                if (body && req.hasOwnProperty("body")) {
                    if (body.constructor !== Object) notError = "body|Object";
                    else {
                        if (body.docs && body.hasOwnProperty("docs")) {
                            if (body.docs.constructor !== Object) notError = "body.docs|Object";
                        } else notError = "body.docs|Object";
                        //
                        if (body.hasOwnProperty("nested")) {
                            var nested = body.nested;
                            if (nested.constructor !== Object) notError = "body.nested|Object";
                            else {
                                if (nested.key && nested.hasOwnProperty("key")) {
                                    if (nested.key.constructor !== String) notError = "nested.key|String";
                                    if (nested.value && nested.hasOwnProperty("value")) {
                                        if (nested.value.constructor !== String) notError = "nested.value|String";
                                    } else notError = "nested.value|String";
                                } else notError = "nested.key|String";
                            }
                        }
                    }
                } else notError = "body|Object";
                //Validation block : end.
                //
                if (notError === true) {
                    var selection = {
                        _id: id,
                        active: true
                    };
                    var docs = req.body.docs;
                    var nested = req.body.nested;
                    if (nested) {
                        selection[nested.key] = nested.value;
                        var partial = {};
                        for (var key in docs) {
                            if (key !== "active") {
                                var parent = nested.key.substr(0, nested.key.lastIndexOf("."));
                                var selected = [parent, key].join('.$.');
                                partial[selected] = docs[key];
                            }
                        }
                        docs = partial;
                    } else {
                        delete docs["active"];
                        delete docs["restricted"];
                    }
                    //
                    model.update(selection, {
                        $set: docs
                    }, {
                        runValidators: true
                    }).then(function (docs) {
                        var rows = mongoose.normalize(docs);
                        res.send({
                            status: 200,
                            message: httpCode[200],
                            error: null,
                            data: rows
                        });
                    }).catch(function (e) {
                        next(e);
                    });
                } else {
                    var error = notError.split("|");
                    var Err = new Error([httpCode[400], id].join(" : "));
                    Err.errors = {
                        require: error[0],
                        type: error[1],
                        founded: eval(error[0])
                    };
                    next(Err);
                }
            });
        } else {
            var error = ("req.params|String").split("|");
            var Err = new Error([httpCode[404], id].join(" : "));
            Err.errors = {
                require: error[0],
                type: error[1],
                founded: eval(error[0])
            };
            next(Err);
        }
    });
    api.delete('/:collection/:id', function (req, res, next) {
        var populate = req.logged.populate;
        var collname = (req.params.collection || "").toLowerCase();
        var id = req.params.id;
        var model = Collection[collname];
        var isAllow = function (callback) {
            model.findOne({
                _id: id,
                // "$or" : [
                //     {restricted : {"$exists" : false}},
                //     {restricted : {"$ne" : true}}
                // ],
                restricted: {"$ne": true},
                active: true
            })
            .populate(populate).lean().then(function (docs) {
                var row = mongoose.normalize(docs);
                var is = authorize.isCorrect(row);
                var code = null;
                //
                if (!docs || !is) code = 404;
                else if (docs.restricted) code = 403;
                //
                if (code) {
                    var error = ("req.params|String").split("|");
                    var Err = new Error([httpCode[code], id].join(" : "));
                    Err.errors = {
                        require: error[0],
                        type: error[1],
                        founded: eval(error[0])
                    };
                    next(Err);
                    return 0;
                } else {
                    callback(row);
                    return 0;
                }
            })
            .catch(function (e) {
                next(e);
                return 0;
            });
        };
        if (id) {
            isAllow(function (row) {
                model.update({
                    _id: id,
                    active: true
                }, {
                    $set: {
                        active: false
                    }
                }).then(function (docs) {
                    var rows = mongoose.normalize(docs);
                    res.send({
                        status: 200,
                        message: httpCode[200],
                        error: null,
                        data: rows
                    });
                }).catch(function (e) {
                    next(e);
                });
            });
        } else {
            var error = ("req.params|String").split("|");
            var Err = new Error([httpCode[404], id].join(" : "));
            Err.errors = {
                require: error[0],
                type: error[1],
                founded: eval(error[0])
            };
            next(Err);
        }
    });
    //
    /** **************************************************************************
     ** http data resource register
     ** **************************************************************************/
    page.use(function (req, res, next) {
        var group = req.logged.user.groups.name.toLowerCase().replace(/\s/g, "");
        if (group !== namescape) next(group);
        else next();
    });
    page.use('/!', api);
    page.get('/', function (req, res, next) {
        locals.www = {
            name: global.name,
            description: global.description,
            activePage: req.url, //todo : buat apa lih?
            version: global.version
        };
        res.render(namescape, locals.www);
    });
    return page;
};
