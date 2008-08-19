require 'rubygems'
require 'eventmachine'
require 'thin'
require 'haml'
require 'json'

__DIR__ = File.dirname File.expand_path(__FILE__)

EM.run{

  class FlashServer < EM::Connection
    def self.start host, port
      puts ">> FlashServer started on #{host}:#{port}"
      EM.start_server host, port, self
    end

    def post_init
      @buf = BufferedTokenizer.new("\0")
      @ip = Socket.unpack_sockaddr_in(get_peername).last rescue '0.0.0.0'
      puts ">> FlashServer got connection from #{@ip}"
    end

    def unbind
      @timer.cancel if @timer
      puts ">> FlashServer got disconnect from #{@ip}"
    end

    def receive_data data
      if data.strip == "<policy-file-request/>"
        send %[
          <?xml version="1.0"?>
          <!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
          <cross-domain-policy>
            <allow-access-from domain="*" to-ports="*" />
          </cross-domain-policy>
        ]
        close_connection_after_writing
        return
      end

      @buf.extract(data).each do |packet|
        puts ">> FlashServer got packet from #{@ip}: #{packet}"
        packet = JSON.parse(packet) # XXX: error handling goes here
        
        if stock = packet['stock']
          # add stock to watch list
          (@stocks ||= []) << stock
          
          @timer ||= EM::PeriodicTimer.new(1) do
            # lookup (i.e. generate) stock prices and send to client
            @stocks.each do |s|
              send({ :time => Time.now.to_s,
                     :stock => s,
                     :price => rand(10_000)/100.0 }.to_json)
            end
          end
        end
        
      end
    end

    def send data
      send_data "#{data}\0"
    end
  end
  
  class StaticApp
    def self.call env
      [ 
        200,
        {'Content-Type' => 'text/html'},
        @page ||= Haml::Engine.new(%[
          %html
            %head
              %title jsSocket example: #{File.basename __FILE__}
              %style{ :type => 'text/css'}
                :sass
                  body
                    margin: 1.5em
                    font-size: 14pt
                    font-family: monospace sans-serif
                  #history
                    height: 200px
                    width: 90%
                    overflow-y: scroll
                    p
                      margin: 0
                      padding: 0
                  form#input
                    input
                      width: 60px
            %body
              %h1 jsSocket example: #{File.basename __FILE__}

              #history
              %form#input
                watch this stock:
                %input{ :type => 'text' }/

              %script{ :type => 'text/javascript', :src => '/js/jquery-latest.min.js' }= ''
              %script{ :type => 'text/javascript', :src => '/js/jquery.media.js' }= ''
              %script{ :type => 'text/javascript', :src => '/js/jsonStringify.js' }= ''
              %script{ :type => 'text/javascript', :src => '/js/jsSocket.js' }= ''

              :javascript
                $socket = jsSocket({ port: 1234,
                                     debug: true,
                                     logger: console.log,
                                     onData: function(data){
                                       $('#history').append(
                                        $('<p/>').text(data)
                                       ).each(function(){
                                         this.scrollTop = this.scrollHeight
                                       }) 
                                     }
                                  })
                $('form#input').submit(function(){
                  $socket.send({ stock: $(this).find('input').val() })
                  $(this).find('input').val('')
                  return false
                })
        ].gsub(/^          /,'')).render
      ]
    end
  end
  
  map = Rack::URLMap.new '/'      => StaticApp,
                         '/js'    => Rack::File.new(__DIR__ + '/../js'),
                         '/flash' => Rack::File.new(__DIR__ + '/../flash')
  
  http  = Thin::Server.start 'localhost', 1233, map
  flash = FlashServer.start  'localhost', 1234
  
}