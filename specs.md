# Client

-   Lit une config `~/.cube/config` en json:

```
{
  "leaderUrl": "localhost:4242",
  "password": "XXX"
}
```

-   `cube nodes` => List les noeuds sur le cluster

```
Name | Status | Type
XXX | Ready | Leader
YYY | Ready | Follower
```

-   `cube apply manifest.json`
    Le manifest contient une list de resource en json:

```
[
  {
    // ressource 1
  },
  {
    // ressource 2
  }
]
```

Une ressource est de definie au minimum par un `type`Pour l instant le seul type disponible sera `pod`
Une resource pourra avoir des metadata dont un name et une liste de label (strings) ainsi qu une clé spec dependant du type de resource
Les pods auront dans leur spec une list de container avec name/image/env
Exemple de manifest:

```
[
  {
    "type": "pod",
    "metadata": {
    	"name": "my-pod",
		"labels": {
			"app": "my-app"
		}
	},
	"spec": {
	  "containers": [
		{
		  "name": "my-container",
		  "image": "nginx:latest",
		  "env": {
			"ENV_VAR1": "value1",
			"ENV_VAR2": "value2"
		  }
		}
	  ]
	}
  }
]
```

-   `cube list [resourceType]` => retourne une liste de toutes les resources

```
name | status | age
my-pod | Running | 10s
```

-   `cube get [resourceType]/[resourceName]` => retourne une liste d information sur la resource: le manifest de la resource + une list d event retracant la vie de la resource (scheduling, creation, starting, status, ...)
-   `cube delete [resourceType]/[resourceName]` => supprime la resource du cluster
-   `cube logs [resourceType]/[resourceName]` => permet de recuperer les logs. Sur un pod tous les logs seront melanges (dans l ordre chronlogique) et prefixe par le nom du container. Il est posible de recuperer uniquement un container: `cube logs [resourceType]/[resourceName] --container [containerName]`
-   `cube exec [resourceType]/[resourceName] --container [containerName] -- [command]` => permet de lancer la commande dans le container (en interactif pour un shell par exemple)

# Server

-   Une application `cube-server` sera deployé sur chaque noeud. L application peut etre demarree en mode leader, dans ce cas il a just besoin d un token (string) ou en mode follower, dans ce cas il a besoin de l url:port du master et le token
-   Les serveur followers tenteront de s annoncer au serveur leader jusqu a ce que cela fonctionne
-   Le serveur leader doit etre capable de gerer des requetes http pour repondre aux commandes du client ainsi que des followers, les serveurs followers devront implementer les requetes http necessaires egalement pour gerer les requetes du leader
-   Le leader devra etre capable de demander au bon node (planificateur basique) de demarrer les containers via docker en question ainsi que de les monitorer (si un container s arrete il faut en redemarrer un, avec un systeme de max crash a la suite avant d arreter / pareil si l image n existe pas / ...)
-   Tous les containers d un pod doivent pouvoir echanger sur le meme reseau (si un container bind le port 3000, un autre du meme pod doit pouvoir acceder a localhost:300)
-   Le stockage des serveurs se feront via une db sqlite sur ce meme serveur (le serveurs cube doit pouvoir redemarrer et retrouver son etat/reconcilier/... sans perdre de data)
