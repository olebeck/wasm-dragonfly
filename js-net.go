package main

import (
	"context"
	"encoding/binary"
	"errors"
	"net"
	"strconv"
	"syscall/js"
	"time"

	"github.com/df-mc/dragonfly/server/session"
	"github.com/sandertv/go-raknet"
	"github.com/sandertv/gophertunnel/minecraft"
)

var uint8Array = js.Global().Get("Uint8Array")
var jsListener js.Value

func init() {
	jsListener = js.Global().Get("jsListener")
}

// from ws-listener
const (
	opListen = iota
	opReadFrom
	opWriteTo
	opErr
)

func (c *jsConn) doOp(op byte, payload []byte, expectResponse bool) ([]byte, error) {
	bufreq := make([]byte, 2+len(payload))
	bufreq[0] = op
	c.seq++
	bufreq[1] = c.seq
	copy(bufreq[2:], payload)
	jssend := uint8Array.New(len(bufreq))
	js.CopyBytesToJS(jssend, bufreq)
	jsbuf, err := netCall("doOp", c.seq, jssend, expectResponse)
	if err != nil {
		return nil, err
	}
	if expectResponse {
		length := jsbuf.Get("length").Int()
		buf := make([]byte, length)
		js.CopyBytesToGo(buf, jsbuf)

		if buf[0] == opErr {
			return nil, errors.New(string(buf[2:]))
		}
		return buf[2:], nil
	} else {
		return nil, nil
	}
}

type jsConn struct {
	seq byte
}

func (c *jsConn) Close() error {
	jsListener.Call("Close")
	return nil
}
func (c *jsConn) SetDeadline(t time.Time) error {
	return nil
}
func (c *jsConn) SetReadDeadline(t time.Time) error {
	return nil
}
func (c *jsConn) SetWriteDeadline(t time.Time) error {
	return nil
}
func (c *jsConn) LocalAddr() net.Addr {
	return &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)}
}

func (c *jsConn) ReadFrom(p []byte) (n int, addr net.Addr, err error) {
	val, err := netCall("ReadFrom")
	if err != nil {
		return 0, nil, err
	}
	valbuf := make([]byte, val.Length())
	js.CopyBytesToGo(valbuf, val)
	resp := valbuf[2:]

	n = len(resp) - 18
	addr = &net.UDPAddr{IP: net.IP(resp[0:16]), Port: int(binary.LittleEndian.Uint16(resp[16:18]))}
	copy(p, resp[18:])
	return
}

func (c *jsConn) WriteTo(p []byte, addr net.Addr) (n int, err error) {
	payload := make([]byte, 18+len(p))
	uaddr := addr.(*net.UDPAddr)
	copy(payload, uaddr.IP)
	binary.LittleEndian.PutUint16(payload[16:18], uint16(uaddr.Port))
	copy(payload[18:], p)

	_, err = c.doOp(opWriteTo, payload, false)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func (c *jsConn) listen(address string) error {
	host, portStr, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	_ = host
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return err
	}

	var payload = make([]byte, 2)
	binary.LittleEndian.PutUint16(payload[0:2], uint16(port))
	_, err = c.doOp(opListen, payload, true)
	if err != nil {
		return err
	}
	return nil
}

type Listener struct {
}

func (Listener) ListenPacket(network, address string) (net.PacketConn, error) {
	c := &jsConn{}
	err := c.listen(address)
	if err != nil {
		return nil, err
	}
	return c, nil
}

type jsNet struct {
}

func (j *jsNet) DialContext(ctx context.Context, address string) (net.Conn, error) {
	return nil, nil
}

func (j *jsNet) PingContext(ctx context.Context, address string) (response []byte, err error) {
	return nil, nil
}

func (j *jsNet) Listen(address string) (minecraft.NetworkListener, error) {
	l, err := raknet.ListenConfig{
		UpstreamPacketListener: &Listener{},
	}.Listen(address)
	return l, err
}

func init() {
	minecraft.RegisterNetwork("js-raknet", &jsNet{})
}

type listener struct {
	*minecraft.Listener
}

// Accept blocks until the next connection is established and returns it. An error is returned if the Listener was
// closed using Close.
func (l listener) Accept() (session.Conn, error) {
	conn, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	return conn.(session.Conn), err
}

// Disconnect disconnects a connection from the Listener with a reason.
func (l listener) Disconnect(conn session.Conn, reason string) error {
	return l.Listener.Disconnect(conn.(*minecraft.Conn), reason)
}
