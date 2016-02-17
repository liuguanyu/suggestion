/**
 * @method suggest 搜索建议
 * @version 0.4.6
 * @param dom   <NodeW>  响应suggest的控件
 * @param opts  <字面量> 配置表
 *        "data_url" :  <提供数据的url>   提供数据的url,默认为空
 *        "suggest_data"  :  <json array> 数据组，json格式，默认为{} , 与data_url必有一个可用
 *        "prefix_protected   : <boolean> 前缀保护，为true时，已经搜索过的不匹配词，再做增长，一律不作响应。默认为true
 *        "item_selectors"    : <选择器> 认为这些是suggest列表项，如果不设置是li.fold-item
 *        "lazy_suggest_time" : <int> 每次按键出suggest时间，默认100毫秒。 
 *        "min_word_length"   :   <int> 最低的字数，低于此字数不进行搜索，默认为零。 
 *        "auto_submit"       :   <boolean> 选中词或回车时自动提交，默认为否。 
 *        "item_hover_style"  :  <string> suggest列表项鼠标经过的样式名 , 默认为fold-hover , 
 *        "pos_adjust"        :  <字面量> 分left , top , width , z-index 设置项,用于微调suggest框的位置 
 *        "get_data_fun"      :  <列举值> ajax 或 jsonp或 remote_call或data_provider , 默认为jsonp , 如果是remote_call,即尝试调用百度的方法
 *        "data_provider"     :  <函数对象> 与get_data_fun=data_provider连用。获取data的方法。
 *        "fill_data_fun"     :  <函数对象> 如提供，将把data传给这个函数对象，要求返回值是一个html，否则走默认的函数,
 *        "render_data_fun"   :  <函数对象> 如提供，将把现在的搜索词和data传给这个函数对象，要求返回值是一个html，否则走默认的函数,
 *        "is_auto_opp_dir"   :  <boolean> 默认为true,当下拉框高度大于页面高度，自动转为向上展开列表，false时不做这个调整
 *        "auto_fix_list_pos" :  <bool> 默认为true , true 在窗口改变大小时，自动更新列表位置,false-如果css保证了这一点。请设为false，节省效率
 *        "suggest_list"      :  <qw> 要求是一个列表的container的qw包裹 , 如果不提供，默认为W('<ul id="search-suggest" class="suggest"></ul>')
 *        "auto_submit"       :  <bool> true 选中列表值后自动调用所在form的submit方法，true-自动提交 false-不自动提交
 *        "remote_call_charset":  <string> 远程数据服务使用的字符集编码 
 *        "remote_call_expire":  <int> 远程数据服务失效时间（分钟），如果是零，信任服务器header头，默认为零 
 *        "onbeforesuggest"   :  <function object> suggest显示前的方法，可以用this.getSuggestData获得对象  
 *        "onaftersuggest"    :  <function object> suggest显示之后执行方法，可用this.getSuggestData获得对象
 *        "onaftergetdata"    :  <function object> suggest获取数据之后执行方法， 如第一个参数为e ，则e.rawdata是刚刚取到的数据，如需加工，可以重新赋值给它
 *        "onbeforechoose"    :  <function object> suggest用上下键选择之后执行方法， 如第一个参数为e ，则e.selectedDom是正要选取的dom
 *        "onafterchoose"     :  <function object> suggest用上下键选择之后执行方法， 如第一个参数为e ，则e.selectedDom是选取的dom
 *        "onafterhide"       :  <function object> suggest列表隐藏后执行的方法
 * 依赖 qwrap1.1.0+
 * TODO : 1，为jq做适配
 */

;(function(){
    var noEventKeycode = [9,16,17,18,19,20,33,34,35,36,37,39,41,42,43,45,47] ,
		mix = QW.ObjectH.mix,
		camelize = function (s) {
			return s.replace(/_/g , "-").camelize();
		},genDomId = (function (){
		    var myId = +new Date();

			return function (){
				return ++myId;	
			}		
	    }());

	function Suggest (dom , opts){
        this._dom = dom;       		
		this.init(opts);
    };


    Suggest.prototype = {
        /*默认属性*/ 
		dataUrl : "" ,
		curIndex : 0 ,
        suggestData : {} ,
        prefixProtected : true ,
        lazySuggestTime : 100 ,
        minWordLength : 0,
        itemSelectors : "li.fold-item" ,
        itemHoverStyle : "fold-hover",
		itemFakeClass:"fake",
		itemNoneClass:"error",
        posAdjust : {} ,
        getDataFun : "jsonp" ,
		remoteCall : "baidu.sug",
		remoteCallCharset : "gbk",
        remoteCallExpire : 0 ,  
        autoFixListPos : true ,
		autoSubmit : false ,
        suggestProtectedTimer : false ,
		invalidWords : {},
		history : {},
        inputWord : "", 
        isAutoOppDir : true,
		emptyPrompt:false,
        trimKW:false,                
        _parsing : 0,
        _suggestTimer : 0,

        init : function (opts){    
            var newOpts = {};
                   
            //强制关闭autocomplete选项
            this._dom.attr("autocomplete" , "off"); 			
			this.suggestList = W('<ul id="search-suggest-'+genDomId()+'" class="suggest"></ul>');
            
            //合并配置项                    
            for(var i in opts){
    		     var el = opts[i] , field = camelize(i);
    			 newOpts[field] = el;
    		};
    		            
            mix(this , newOpts , 1);
            
            !this.renderDataFun && (this.renderDataFun = this._defaultRenderDataFun);
            !this.fillDataFun   && (this.fillDataFun   = this._defaultFillDataFun);
            if(this.customClass){
				this.suggestList.addClass(this.customClass);
			}
            //把列表项容器挂载到dom           
            W("body").appendChild(this.suggestList);
            
            //挂载事件
            this._bindEvent();          
		},
		
        hideList : function (){
            if (this.suggestList.isVisible()){
                var ahe = new CustEvent(this , 'afterhide');

                this.suggestList.hide(); 
                this._fixPos(false);    

                this.curIndex = 0; 
                this._stop();

                if (this.fire(ahe) === false) return false;
            }
        },	
        getDom:function(){
			return this._dom;
		},
        getSuggestData : function (word){
            if (word == undefined){
                word = this._dom.val();    
            }
            return ("undefined" != typeof(this.history[word])) ? this.history[word] : {}; 
        },

		genDomId : function (){
			return genDomId();
		},	
		
		_start : function (){
            var self = this; 
                
    		clearInterval(this._suggestTimer);       
    
            this._suggestTimer = setInterval( function () {        			  
    			  word = W(self._dom).val();
				  if (self.trimKW){
					word=word.trim();
				  }
    			  if (self.inputWord != word){
    			      if (self.fire("beforesuggest") === false) return false;
    			      self.inputWord = word;    
                      self._doGetData(word); 
    			  }        			  
    		} , self.lazySuggestTime);
    	},
	    
		_stop : function (){
            clearInterval(this._suggestTimer);
        },	    
	    
        _isValidWord : function(word){                
            if (word.length > 50){
                return false;       
            }
            
            if (this.invalidWords[word]){
                return false;
            }
    
    		return true;
    	},	  
    	
        _parseData : function (word , jsonData){
             var parsedData = {} , dataStr,self=this;
             try{
                 parsedData = JSON.parse(jsonData);  
             }    
             catch(exp){}
    
             dataStr = JSON.stringify(parsedData);
    
             this._initList(parsedData);

             if (dataStr === "{}" || dataStr === "[]"){
				if(!self.emptyPrompt){
					this.invalidWords[word] = 1; 
					this.hideList();
				}
             } 
             else{
                this.history[word] = jsonData; 
             }
             this._parsing = 0;
             if (this.fire("aftersuggest") === false) return false;
        },    
        
        _initList : function (data){
             var list = [] ,
                 nowWord = this._dom.val();
			 if(this.trimKW){
				nowWord=nowWord.trim();
			 }
             this._fixPos(true);   
             
             list.push(this.renderDataFun(nowWord , data)); 
             
             this.suggestList.html(list.join("")).show();

             this._dealwithListDirection();
        } ,   
        
        _defaultFillDataFun : function (item){
             this._dom.val(W(item).html().stripTags());
        } ,
        
        _defaultRenderDataFun : function (nowWord , data){
             var list = [] , tmp ; 
             
             list.push('<li class="fold-bg"></li>');
             for(var i = 0 ; i < data.length ; ++i){
                tmp = data[i].replace(nowWord , "<em class='red'>"+nowWord+"</em>");
                list.push('<li class="fold-item"><span class="title">'+tmp+'</span></li>');
             }
       
             return list.join("");
        },                    	  
	    
        _doGetData : function (word){			
            var self = this , clearLongRequest;
    
            if ("" == word.trim()){
                this.hideList();
                return false;
            }
    
            if (this.prefixProtected && !self._isValidWord(word)) {
                this.hideList();
                return false;     
            } 
            if (word.length < self.minWordLength){
                this.hideList();
                return false;
            }
			
            clearLongRequest = function (){
                var oldTime = this._parsing;
                if (!oldTime){
                    return ;
                }
    
                var now = +new Date();
                if (now - oldTime > 2000){
                    this._parsing = 0;
                }
            };
    
            if (self._parsing){
                clearLongRequest.apply(this);
            }
			
            if (!self._parsing){
                self._parsing = +new Date();  
                
                setTimeout(function (){
                    clearLongRequest.apply(self);
                } , 2000);    
                if (self.history[word]){
                    self._parseData(word , self.history[word]);
                } 
                else {
                    if (this.dataUrl || (!this.dataUrl) && this.getDataFun == "data_provider_byword"){ 
                        var url = self.dataUrl.replace(/%KEYWORD%/ , encodeURIComponent(word)) , 
                            afterData = function (d){
                                 var e = new CustEvent(this , 'aftergetdata'), nd;  
                                                                
                                 e.rawdata = d;
								
                                 nd = this.fire(e);                               

                                 if (nd === false) {
                                     return false;     
                                 }
                                
                                 return (nd == null) ? d :  e.rawdata ;    
                            };
                       
                        if (this.getDataFun == "ajax"){
                            Ajax.request(url , "" , function (d) {
                                 d = afterData.call(self , d) ;
                                 if (d === false){
                                     return false;   
                                 }  
                                 self._parseData(word , d);    
                            } , "get"); 
                        }
                        else if (this.getDataFun == "jsonp"){
                            loadJsonp(url , function (d){
                                 d = afterData.call(self , d) ;
                                 if (d === false){
                                     return false;   
                                 }  
                                 self._parseData(word , JSON.stringify(d));
                            });
                        } 
						else if (this.getDataFun == "data_provider"){
						    url = url.replace(/%callbackfun%/ , "callbackfun");
							this.dataProvider.call(self , url , function (d){
								d = afterData.call(self , d) ;
                                if (d === false){
                                    return false;   
                                }  
                                self._parseData(word , JSON.stringify(d));		
							});
						}	
                        else if (this.getDataFun == "data_provider_byword"){
                            this.dataProvider.call(self , word , function (d){
                                d = afterData.call(self , d) ;
                                if (d === false){
                                    return false;   
                                }  
                                self._parseData(word , JSON.stringify(d));        
                            });
                        }                           
                        else if (this.getDataFun == "remotejs"){
                            var paramInfo = self.remoteCall.split(".") , 
                                lp = paramInfo.length , 
                                tmp = {} , _t="";

                             if (lp < 1){
                                 return ;   
                             }
                             
                             tmp[paramInfo[lp - 1]] = function (d){ 
                                 d = afterData.call(self , d) ;
                                 if (d === false){
                                     return false;   
                                 }     

                                 self._parseData(word , JSON.stringify(d));    
                             };                             

                             for(var i = lp - 2 ; i >= 0  ; --i){
                                 tmp[paramInfo[i]] = tmp[paramInfo[i]] || {} ;
                                 tmp[paramInfo[i]][paramInfo[i+1]] = tmp[paramInfo[i+1]];             
                             }

							 if (lp == 1){							    
								 window[paramInfo[0]] = window[paramInfo[0]] || tmp[paramInfo[0]] || {};
							 }
							 else{
								 window[paramInfo[0]] = window[paramInfo[0]] || {};
								 window[paramInfo[0]][paramInfo[1]] = tmp[paramInfo[1]];
							 }

                             if (self.remoteCallExpire){
                                 _t = Math.floor(+(new Date()) / 1000 / self.remoteCallExpire); 
                                 if (/\?/.test(url)){
                                     _t = "&_t=" + _t;
                                 }
                                 else{
                                     _t = "?_t=" + _t;
                                 }
                             }
                             
                             loadJs(url + _t , function (){} , {"charset" : self.remoteCallCharset});
                        }
						else if (this.getDataFun == "remoteparam"){
                             loadJs(url , function (){
								var d = window[self.remoteCall];
								d = afterData.call(self , d) ;
                                 if (d === false){
                                     return false;   
                                 }     
                                 self._parseData(word , JSON.stringify(d));
								
							 } , {"charset" : self.remoteCallCharset});
							 
                        }
                    } 
                    else {
                        self._parseData(word , self.suggestData); 
                    }
                }
            } 
        }, 
        
        _submitMe : function (obj){
            var self = this , fireResult , frmNode;
            W(obj).removeClass(self.itemHoverStyle);
            if(!W(obj).hasClass(self.itemFakeClass)){
				self.hideList(); 
			}
            self.fillDataFun(obj);
            if (self.autoSubmit){
                frmNode = self._dom.parentNode("form");
                fireResult = frmNode.fire("submit");
                if (fireResult){
                    frmNode.submit();
                }
            }
    
            if (self._dom.val().trim() != ""){
                self.inputWord = W(self._dom).val();
            }
        } ,    	    
		
		_bindEvent : function (){
		    var self = this ;
		    
		    this._dom.on("blur" , function (){
		        self._stop();
		    });
		    
            this._dom.on("keyup" , function (e){
                var keyCode = e.keyCode; 
                if (keyCode != 38 && keyCode != 40 && keyCode != 13){
                    self.curIndex = 0;  
                }
            });	
					
            this._dom.on("paste",function(e){
				self._start();
			});
			
    	    this._dom.on("keydown" , function (e){
                var keyCode = e.keyCode;

                if(keyCode > 111 && keyCode < 138){ // F1 ~F12 以及控制键无事件
                    return ;
                }    
                if(noEventKeycode.contains(keyCode)){ //指定的不响应控制键无事件
                    return ;
                }    
                if(keyCode == 27){//ESC键,隐藏列表
                    self.hideList();
                    return ;
                }
                if(keyCode == 13){
                    if (self.curIndex != 0){
                        /*
                        (function (){
                            self._submitMe(self.suggestList.query(self.itemSelectors)[self.curIndex - 1]);
                        })();
                        */
                        self.hideList();
                        if (!self.autoSubmit){
                            e.preventDefault();
                        }
                    }
                    return ;
                }
                if(keyCode == 38 || keyCode == 40) {//上下光标键
                    self._stop();
                    
                    var liLen = self.suggestList.query(self.itemSelectors).length;
                    if (liLen){
                        ++liLen;
                        if (keyCode == 38){
                            self.curIndex = (self.curIndex - 1 + liLen) % liLen;
							/*NOTICE !!!!
								为了业务需要，有些项需要跳过选择
							*/
							var _curNode=self.suggestList.query(self.itemSelectors).item(self.curIndex - 1);
							if(_curNode&&_curNode.hasClass(self.itemFakeClass)){
								self.curIndex = (self.curIndex - 1 + liLen) % liLen;
							}
                        }
                        else if (keyCode == 40){
                            self.curIndex = (self.curIndex + 1 + liLen) % liLen; 
							/*NOTICE !!!!
								为了业务需要，有些项需要跳过选择
							*/
							var _curNode=self.suggestList.query(self.itemSelectors).item(self.curIndex - 1);
							if(_curNode&&_curNode.hasClass(self.itemFakeClass)){
								self.curIndex = (self.curIndex + 1 + liLen) % liLen; 
							}
                        }
    
                        if (self.curIndex == 0){
                            //self.hideList();
                            self._dom.val(self.inputWord);
                            self.suggestList.query(self.itemSelectors).removeClass(self.itemHoverStyle);
                        }    
                        else {
                            var selectedDom = self.suggestList.query(self.itemSelectors)[self.curIndex - 1],
                                bce = new CustEvent(self , 'beforechoose'),  
                                ace = new CustEvent(self , 'afterchoose');
                               
                                bce.selectedDom = selectedDom;
                                ace.selectedDom = selectedDom;  
                                
                            if (self.fire(bce) === false) return false;    
                            self.suggestList.show();
                            self._dealwithListDirection();
                            self.fillDataFun(selectedDom);
                            self.suggestList.query(self.itemSelectors).removeClass(self.itemHoverStyle);
                            W(selectedDom).addClass(self.itemHoverStyle);
                            if (self.fire(ace) === false) return false;
                        }
                    }
                    e.preventDefault(); 
                    return ;
                }
                self._start();
    		});       
    		
    		//列表项行为
    		self.suggestList.delegate("li" , "mouseover" , function (){
                W(this).addClass(self.itemHoverStyle);  
            }).delegate("li" , "mouseout" , function (){
                W(this).removeClass(self.itemHoverStyle);  
            }).delegate("li" , "click" , function (){
                self._submitMe.apply(self , [this]);
            });

            //收起列表项
            W("body").on("click" , function (e){
				var fake_item=W(e.target).ancestorNodes('li.'+self.itemFakeClass);
				if(fake_item.length>0&&W(e.target).ancestorNodes('.suggest').attr('id')==self.suggestList.attr('id')){
					if(!fake_item.hasClass(self.itemNoneClass)){
						var near_item=fake_item.nextSibling('li:not(.fake)');
						self._dom.val(near_item.query('.sug-item').attr('data'));
						near_item.addClass(self.itemHoverStyle);
					}
					//self._dom.focus();
					return false;
				}
                
                self.hideList();
                self.curIndex = 0;
            });         
		    
            //窗口resize时，重定位suggest位置
            W(window).on("resize" , (function() {
                 var timer ;
                 return function (){
                     //防止resize时多次调用
                     clearTimeout(timer);
                     
                     timer = setTimeout(function(){
                        self.autoFixListPos && self._resetPos();
                     } , 100);   
                 }
            })()); 		
            
            //自定义事件
            Suggest.EVENTS = ['beforesuggest', 'aftersuggest' , 'aftergetdata' , 'beforechoose' , 'afterchoose' , 'afterhide'];
            CustEvent.createEvents(this , Suggest.EVENTS);    
		},

        _dealwithListDirection : function (){
            /*
            if (this.isAutoOppDir){
                var listPos = this.suggestList.getRect() , 
                docPos = DomU.getDocRect() , 
                domPos = this._dom.getRect();

                if (listPos.bottom > docPos.scrollHeight){
                    if (domPos.top - listPos.height > docPos.scrollY){
                        W(this.suggestList).css("top" , domPos.top - listPos.height + "px");     
                    }
                }    
            }
            */
        },
    
		_fixPos : (function (){
		    var lastDoms = {} , doFix = function (){
                var domPos = this._dom.getRect() ,
                    lastDom = lastDoms[this.suggestList.attr("id")];

                if (domPos.left != lastDom.left || domPos.top != lastDom.top || domPos.forid != lastDom.forid){
                    this._resetPos();
                    lastDom = domPos;
                }      
            }; 
            
            return function (bool){
                bool && this.autoFixListPos && (function(){
                    var sid = this.suggestList.attr("id") , lastDom;

    		        if (!lastDoms[sid]){
    		            lastDom = this._dom.getRect();
                        lastDom.forid = sid;
                        lastDoms[sid] = lastDom;
    		            this._resetPos();    
    		        }
    		        
    		        doFix.apply(this);    		        
		        }.call(this , arguments[0]));
		    };   
		}).apply(this),
		
		_resetPos : function (){
		    var offset = this._dom.getRect(),
		        adjust = this.posAdjust ;

		    this.suggestList.css({
                "position" : "absolute",
                "top"      : ((adjust["top"]) ? adjust["top"] + offset.bottom  : offset.bottom) + "px" ,
                "left"     : ((adjust["left"]) ? adjust["left"] + offset.left  : offset.left) + "px" ,
                "width"    : ((adjust["width"]) ? adjust["width"] + offset.width  : offset.width) + "px" ,
                "z-index"  : (adjust["z-index"]) ? adjust["z-index"] : 99 
            }, 1);

           
            this._dealwithListDirection();
		}
    }
    	
    QW.provide("Suggest" , Suggest);
}());