class JsSocket {
  static var socket:flash.net.Socket;
  static var id:String;

  private static function calljs(type, data:Dynamic) {
    flash.external.ExternalInterface.call('jsSocket.callback', id, type, data);
  }

  static function main() {
    id = flash.Lib.current.loaderInfo.parameters.id;

    flash.external.ExternalInterface.addCallback("open", open);
    flash.external.ExternalInterface.addCallback("send", send);
    flash.external.ExternalInterface.addCallback("close", close);

    calljs('onLoaded', true);
  }

  static function open(host, port) {
    flash.system.Security.loadPolicyFile('xmlsocket://' + host + ':' + port);
    socket = new flash.net.Socket();

    socket.addEventListener(flash.events.Event.CONNECT, function(s){
      calljs('onOpen', true);
    });

    socket.addEventListener(flash.events.Event.CLOSE, function(e){
      calljs('onClose', null);
    });

    socket.addEventListener(flash.events.IOErrorEvent.IO_ERROR, function(e){
      calljs('onClose', e.text);
    });

    socket.addEventListener(flash.events.SecurityErrorEvent.SECURITY_ERROR, function(e){
      calljs('onClose', e.text);
    });

    socket.addEventListener(flash.events.ProgressEvent.SOCKET_DATA, function(d){
      calljs('onData', socket.readUTFBytes(socket.bytesAvailable));
    });

    return socket.connect(host, Std.parseInt(port));
  }

  static function send(data:String) {
    if (socket.connected && data.length > 0) {
      socket.writeUTFBytes(data);
      socket.writeUTFBytes("\x00");
      socket.flush();
      return true;
    } else
      return false;
  }

  static function close() {
    if (socket.connected)
      socket.close();
  }
}
