// includes
// multiparty
var multiparty = require('multiparty');
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var _ = require('lodash');

var cacheManager = require('cache-manager');
var memoryCache = cacheManager.caching({store:'memory',max: 150}) //use a LRU-cache with 150 items

// logger
// var logger = require('../../logger');
// db
var Corpus = require('../../modules/corpus');
var CorpusDB = require('../../models').Corpus;
var Article = require('../../models').Article;



// functions
var getCorpusArticles = function(req, res, next) {
    // get data
    var corpus = req.params.id;

    // find corpus
    CorpusDB.findOne({
        _id: corpus
    }).exec(function(err, corpus) {
        if (err) {
            return next(err);
        }

        // find articles
        Article.find({
            corpuses: corpus._id
        }, function(err, articles) {
            if (err) {
                return next(err);
            }

            // append counts to corpus
            corpus = corpus.toObject();
            corpus.articles = articles;

            // send response
            return res.send(corpus);
        });
    });
};

// export routes
module.exports = function(app) {
    // export create corpus
    app.post('/api/corpus', function(req, res, next) {
        // get form
        var form = new multiparty.Form();

        // parse the form
        form.parse(req, function(err, fields, files) {
            if (err) {
                return next(err);
            }

            // init corpus with user
            var corpus = {
                user: req.user._id
            };
            // push field values into it
            for (var field in fields) {
                corpus[field] = fields[field][0];
            }

            // if files was sent
            // push files info into corpus
            if (files.input) {
                corpus.files = [];
                corpus.input_count = files.input.length;
                for (var index in files.input) {
                    var file = files.input[index];
                    corpus.files.push({
                        name: file.originalFilename,
                        path: file.path,
                    });
                }
            }

            // trigger creation
            Corpus.createCorpus(corpus, function(err, id) {
                if (err) {
                    return next(err);
                }

                return res.redirect('/corpus/' + id);
            });
        });
    });

    // export get corpus
    app.get('/api/corpus/:id', function(req, res, next) {
        // get data
        var corpus = req.params.id;

        // find corpus
        CorpusDB.findOne({
            _id: corpus
        }, function(err, corpus) {
            if (err) {
                return next(err);
            }

            // find articles
            Article.find({
                corpuses: corpus._id
            }, function(err, articles) {
                if (err) {
                    return next(err);
                }
                var articlesCount = articles.length;
                var entitiesCount = 0;

                // count entities
                articles.forEach(function(article) {
                    entitiesCount += article.entities.length;
                });

                // append counts to corpus
                corpus = corpus.toObject();
                corpus.articlesCount = articlesCount;
                corpus.entitiesCount = entitiesCount;

                // send response
                return res.send(corpus);
            });
        });
    });

    app.get('/api/corpus/:id/mrFacets', function(req,res){
        var corpusId = req.params.id;

        memoryCache.get(corpusId,function(err,data){
          if (data) return res.send(data);
        })

        var mrArticles = {};
        mrArticles.map = function(){
          var entities=[];
          var types=[];
          this.entities.forEach(function(entity){
            entities.push(entity.name);
            //extract types of entity and push into types array
            entity.types.forEach(function(type){
                        types.push(type);
            })
          })
          emit(this._id,{entities:entities,types:types,title:this.title,source:this.source,count:0});
        }

        mrArticles.reduce = function(key,values){
          return values;
        }

        mrArticles.query = { "corpuses" : corpusId};

        var mrEntities = {};

        mrEntities.map = function() {
         var article_id = this._id;
        	this.entities.forEach(function(entity){
        			emit(entity.name,{articles:[article_id],types:entity.types,count:1});
        	})
        }

        mrEntities.reduce = function(key, values) {

          	var reduced = {articles:[],types:[],count:0};
            values.forEach(function(value) {
        		reduced.count += value.count;

        		value.articles.forEach(function(article){
        		  reduced.articles.push(article);
        		})

        		value.types.forEach(function(type){
        			reduced.types.push(type);
        		})


        	});


        	//just eliminate duplicates

        	var o = {}, i, l = reduced.articles.length, r = [];
            for(i=0; i<l;i+=1) o[reduced.articles[i]] = reduced.articles[i];
            for(i in o) r.push(o[i]);
        	reduced.articles = r;

        	var o = {}, i, l = reduced.types.length, r = [];
            for(i=0; i<l;i+=1) o[reduced.types[i]] = reduced.types[i];
            for(i in o) r.push(o[i]);
        	reduced.types = r;

          //reduced.articles = _.unique(reduced.articles);
          //reduced.types = _.unique(reduced.types);



        	return reduced;
        }
        mrEntities.query = { "corpuses" : corpusId};



        var mrTypes = {};

        mrTypes.map = function(){
          var article_id = this._id;
          this.entities.forEach(function(entity){
            var entity_id = entity.name;
            entity.types.forEach(function(type){
              emit(type,{articles:[article_id],entities:[entity.name],count:1});
            })
          })
        }

        mrTypes.reduce = function Reduce(key, values) {
          var reduced = {articles:[],entities:[],count:0};

          values.forEach(function(value) {
            reduced.count += value.count;
            value.articles.forEach(function(article){
              reduced.articles.push(article);
            })
            value.entities.forEach(function(entity){
              reduced.entities.push(entity);
            })
          });



          //just eliminate duplicates
          var o = {}, i, l = reduced.articles.length, r = [];
          for(i=0; i<l;i+=1) o[reduced.articles[i]] = reduced.articles[i];
          for(i in o) r.push(o[i]);
          reduced.articles = r;

          var o = {}, i, l = reduced.entities.length, r = [];
          for(i=0; i<l;i+=1) o[reduced.entities[i]] = reduced.entities[i];
          for(i in o) r.push(o[i]);
          reduced.entities = r;

          return reduced;
        }

        mrTypes.query = { "corpuses" : corpusId};



        var processData = async(function(){
          var corpus = {};
          //corpus.corpusId = corpusId;

          var mrOp = await([
            Article.mapReduce(mrArticles, function(err,results){
              if (err) return res.send(err);
              corpus.articles = results;
            }),
            Article.mapReduce(mrEntities, function(err,results){
              if (err) return res.send(err);
              corpus.entities = results;
            }),
            Article.mapReduce(mrTypes, function(err,results){
              if (err) return res.send(err);
              corpus.types = results;
            })
          ])

          memoryCache.set(corpusId,corpus);
          return corpus;
        })


        processData().then(function(data){
          return res.send(data);
        })


        /*function getCachedData(id, cb){
          memoryCache.wrap(id, function(data){
            processData().then(data)
          },cb)
        }

        getCachedData(corpusId,function(data){
          console.log('first call');
          getCachedData(corpusId,function(data){
            return res.send(data);
          })
        })*/



        /*memoryCache.wrap(corpusId,function(data){
          processData().then(data)
        },function(data){
          res.send(data);

        })*/









        /*Article.mapReduce(mrArticles, function(err,results){
          if (err) return res.send(err);
          return res.send(results);
        })*/

        // Article.mapReduce(mrEntities, function(err,results){
        //   if (err) return res.send(err);
        //
        //   return res.send(results);
        // })
        /*Article.mapReduce(mrTypes, function(err,results){
          if (err) return res.send(err);

          return res.send(results);
        })*/






    })


    app.get('/api/corpus/:id/article/:article_id',function(req,res){
      var corpusId = req.params.id;
      var articleId = req.params.article_id;
      memoryCache.get(corpusId,function(err,data){
        if (err) return res.send({"error":"Corpus data not cached!"});
        var pos = _.findIndex(data.articles, function(article){
          return article._id == articleId
        })
        return (pos>-1) ? res.send({_id:data.articles[pos]._id,source:data.articles[pos].value.source}) : res.send({"error":"article not found!"})
      })
      //return res.send({corpus:corpusId,article:articleId})
    })

    app.get('/api/corpus/:id/articles', function(req,res){
      var corpusId = req.params.id;
      console.log(req.query.model)
      /*Article.paginate({corpuses:corpusId},{page:1,limit:20,columns:'source'},function(err,data,pageCount,itemCount){
        if (err) return res.send(err);
        console.log(pageCount);
        console.log(itemCount);
        return res.send(data);
      })*/

    })

    app.get('/api/corpus/:id/facet',function(req,res){
      var corpusId = req.params.id;
      var corpus = {};
      corpus.corpusId = corpusId;
      //get facet data from cache
      memoryCache.get(corpusId,function(err,data){
        if (err) return res.send({"error":"Corpus data not cached!"});

        //get articles without source for facets
        data.articles.forEach(function(article){
          delete article.value.source;
        })

        corpus.articles = data.articles;
        corpus.entities = data.entities;
        corpus.types = data.types;
        return res.send(corpus);
      })
    })

    // export get corpus
    app.get('/api/corpus/:id/facets', getCorpusArticles);

    // relations
    app.get('/api/corpus/:id/relations', getCorpusArticles);

    // co-occurence
    app.get('/api/corpus/:id/cooc', getCorpusArticles);
};
