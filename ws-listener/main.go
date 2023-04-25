package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

const (
	opListen = iota
	opReadFrom
	opWriteTo
	opErr
)

func echo(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}

	writeMessage := func(op, seq byte, payload []byte) error {
		err = c.WriteMessage(websocket.BinaryMessage, append([]byte{op, seq}, payload...))
		return err
	}

	onErr := func(err error) {
		logrus.Error(err)
		err = writeMessage(opErr, 0, []byte(err.Error()))
		if err != nil {
			logrus.Error(err)
		}
	}

	defer c.Close()
	var l net.PacketConn
	defer func() {
		if l != nil {
			l.Close()
		}
	}()
	for {
		mt, message, err := c.ReadMessage()
		if err != nil {
			log.Println("read:", err)
			break
		}

		if mt != websocket.BinaryMessage {
			logrus.Warn("%d not binary message %s", mt, string(message))
			continue
		}

		var op = message[0]
		var seq = message[1]
		var data = message[2:]

		var readBuf = make([]byte, 0xffff+22)

		switch op {
		case opListen:
			var port = binary.LittleEndian.Uint16(data[:2])
			addr := fmt.Sprintf("0.0.0.0:%d", port)
			logrus.Infof("Listening on udp %s", addr)
			l, err = net.ListenPacket("udp", addr)
			if err != nil {
				onErr(err)
				return
			}

			go func() {
				for {
					n, addr, err := l.ReadFrom(readBuf[18:])
					if err != nil {
						onErr(err)
						return
					}

					uaddr := addr.(*net.UDPAddr)
					copy(readBuf[0:16], uaddr.IP)
					binary.LittleEndian.PutUint16(readBuf[16:18], uint16(uaddr.Port))

					err = writeMessage(opReadFrom, 0, readBuf[:18+n])
					if err != nil {
						onErr(err)
						return
					}
				}
			}()

			err = writeMessage(opListen, seq, nil)
			if err != nil {
				onErr(err)
				return
			}

		case opWriteTo:
			var ip = net.IP(data[0:16])
			var port = binary.LittleEndian.Uint16(data[16:18])
			var payload = data[18:]
			_, err := l.WriteTo(payload, &net.UDPAddr{IP: ip, Port: int(port)})
			if err != nil {
				onErr(err)
				return
			}
		}
	}
}

func main() {
	addr := "0.0.0.0:7812"
	http.HandleFunc("/", echo)
	logrus.Infof("Listening on %s", addr)
	logrus.Fatal(http.ListenAndServe(addr, nil))
}
