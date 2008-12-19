/*
 * jsSocket: generic javascript socket API
 *   (c) 2008 Aman Gupta (tmm1)
 * 
 *   http://github.com/tmm1/jsSocket
*/

function jsSocket(args){
  if ( this instanceof arguments.callee ) {
    if ( typeof this.init == "function" )
      this.init.apply( this, (args && args.callee) ? args : arguments );
  } else
    return new arguments.callee( arguments );
}

// location of jsSocket.swf
jsSocket.swf = "/flash/jsSocket.swf"

// list of sockets
jsSocket.sockets = {}

// flash entry point for callbacks
jsSocket.callback = function(id, type, data){
  var sock = jsSocket.sockets[id]
  sock.callback.apply(sock, [type, data])
}

jsSocket.prototype = {
  num: null,      // numeric id
  id: null,       // dom id

  wrapper: null,  // dom container for flash object
  sock: null,     // flash object

  host: null,     // host == null means window.location.hostname
  port: null,     // port to connect to (443 is recommended to get through firewalls)

  // toggle packet reading mode between null terminated or size prefixed
  // null terminated is the default to be bacwards compatible with flash8/AS2s XMLSocket
  // flash9/AS3 supports size prefixed mode which allows sending raw data without base64
  sizedReads: false,

  init: function(opts) {
    var self = this

    // update options
    if (opts)
      $.extend(self, opts)

    // don't autoconnect unless port is defined
    if (!self.port)
      self.autoconnect = false

    // assign unique id
    if (!self.num) {
      if (!jsSocket.id)
        jsSocket.id = 1

      self.num = jsSocket.id++
      self.id = "jsSocket_" + self.num
    }

    // register with flash callback handler
    jsSocket.sockets[self.id] = self

    // install flash socket
    $(function(){
      self.wrapper = $('<div />').attr('id', 'jsSocketWrapper_'+self.num)
                                 .css('position', 'absolute')
                                 .appendTo('body')
                                 .media({ src: jsSocket.swf,
                                          attrs: { id: self.id },
                                          width: 1,
                                          height: 1,
                                          params: { id: self.id },
                                          flashvars: { id: self.id, sizedReads: self.sizedReads }
                                       })

      $(window).bind('beforeunload', function(){
        self.close()
      })
    })
  },


  loaded: false,       // socket loaded into dom?
  connected: false,    // socket connected to remote host?
  debug: false,        // debugging enabled?

  autoconnect: true,   // connect when flash loads
  autoreconnect: true, // reconnect on disconnect

  // send ping every minute
  keepalive: function(){ this.send({ type: 'ping' }) },
  keepalive_timer: null,

  // reconnect logic (called if autoreconnect == true)
  reconnect: function(){
    this.log('reconnecting')

    if (this.reconnect_interval) {
      clearInterval(this.reconnect_interval)
    }

    this.reconnect_countdown = this.reconnect_countdown * 2

    if (this.reconnect_countdown > 48) {
      this.log('reconnect failed, giving up')
      this.onStatus('failed')
      return
    } else {
      this.log('will reconnect in ' + this.reconnect_countdown)
      this.onStatus('waiting', this.reconnect_countdown)
    }

    var secs = 0, self = this

    this.reconnect_interval = setInterval(function(){
      var remain = self.reconnect_countdown - ++secs
      if (remain == 0) {
        self.log('reconnecting now..')
        clearInterval(self.reconnect_interval)

        self.autoconnect = true
        self.remove()
        self.init()
      } else {
        self.log('reconnecting in '+remain)
        self.onStatus('waiting', remain)
      }
    }, 1000);
  },
  reconnect_interval: null,
  reconnect_countdown: 3,
  
  // wrappers for flash functions

  // open/connect the socket
  // happens automatically if autoconnect is true
  open: function(host, port) {
    if (host) this.host = host
    if (port) this.port = port

    this.host = this.host || window.location.hostname
    if (!this.port)
      this.log('error: no port specified')

    this.onStatus('connecting')
      
    return this.sock.open(this.host, this.port);
  },
  connect: function(){ this.open.apply(this, arguments) },

  // send/write data to the socket
  // if argument is an object, it will be json-ified
  send: function(data) {
    if (typeof data == "object")
      data = JSONstring.make(data)

    return this.sock.send(data);
  },
  write: function(){ this.send.apply(this, arguments) },

  // close/disconnect the socket
  close: function() {
    this.autoreconnect = true
    if (this.loaded && this.connected)
      this.sock.close()
  },
  disconnect: function(){ this.close.apply(this) },
  
  // uninstall the socket
  remove: function() {
    delete jsSocket.sockets[this.id]
    if (this.loaded && this.connected)
      this.sock.close()
    $('#jsSocketWrapper_'+this.num).remove();
  },
  
  // debugging
  
  log: function(){
    if (!this.debug) return;

    arguments.slice = Array.prototype.slice
    var args = arguments.slice(0)

    if (this.logger)
      this.logger.apply(null, [[this.id].concat(args)])
  },
  
  // flash callback

  callback: function(type, data) {
    var self = this

    setTimeout(function(){ // wrap in setTimeout(.., 0) to free up flash's ExternalInterface
      switch(type){
        case 'onLoaded':
          self.log('loaded')
          self.loaded = true
          self.sock = document.getElementById(self.id)

          if (self.autoconnect)
            self.connect()

          break

        case 'onOpen':
          if (data == true) {
            self.log('connected')
            self.connected = true

            if (self.keepalive)
              self.keepalive_timer = setInterval(function(){
                self.keepalive.apply(self)
              }, 1*60*1000)

            self.reconnect_countdown = 3
            if (self.reconnect_interval)
              clearInterval(self.reconnect_interval)

            self.onStatus('connected')

          } else {
            self.log('connect failed')
            if (self.autoreconnect)
              self.reconnect()
          }

          break

        case 'onClose':
          self.connected = false
          self.log('disconnected')
          self.onStatus('disconnected')

          if (self.keepalive && self.keepalive_timer) {
            clearInterval(self.keepalive_timer)
            self.keepalive_timer = null
          }

          if (self.autoreconnect)
            self.reconnect()

          break

        case 'onData':
          self.log('got data: ', data)
      }

      self[type](data)
    }, 0)
  },
  
  // callback hooks

  onLoaded: function(){},
  onOpen:   function(){},
  onClose:  function(){},
  onStatus: function(){},
  onData:   function(){}
}
