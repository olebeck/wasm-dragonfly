package main

import (
	"fmt"
	"os"

	"github.com/df-mc/dragonfly/server"
	"github.com/df-mc/dragonfly/server/player/chat"
	"github.com/pelletier/go-toml"
	"github.com/sandertv/gophertunnel/minecraft"
	"github.com/sirupsen/logrus"
)

func main() {
	log := logrus.New()
	log.Formatter = &logrus.TextFormatter{ForceColors: true}
	log.Level = logrus.DebugLevel

	chat.Global.Subscribe(chat.StdoutSubscriber{})

	conf, err := readConfig(log)
	if err != nil {
		log.Fatalln(err)
	}

	conf.Listeners = []func(conf server.Config) (server.Listener, error){
		func(conf server.Config) (server.Listener, error) {
			l, err := minecraft.Listen("js-raknet", "0.0.0.0:19132")
			return &listener{l}, err
		},
	}

	srv := conf.New()
	srv.CloseOnProgramEnd()

	srv.Listen()
	for srv.Accept(nil) {
	}
}

// readConfig reads the configuration from the config.toml file, or creates the
// file if it does not yet exist.
func readConfig(log server.Logger) (conf server.Config, err error) {
	c := server.DefaultConfig()
	if _, err = os.Stat("config.toml"); os.IsNotExist(err) {
		data, err := toml.Marshal(c)
		if err != nil {
			return conf, fmt.Errorf("encode default config: %v", err)
		}
		if err := os.WriteFile("config.toml", data, 0o644); err != nil {
			return conf, fmt.Errorf("create default config: %v", err)
		}
		return c.Config(log)
	}
	data, err := os.ReadFile("config.toml")
	if err != nil {
		return conf, fmt.Errorf("read config: %+#v", err)
	}
	if err := toml.Unmarshal(data, &c); err != nil {
		return conf, fmt.Errorf("decode config: %v", err)
	}
	c.World.Folder = "world1"
	return c.Config(log)
}
