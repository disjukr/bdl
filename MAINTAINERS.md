# how to publish bdlc docker image

```sh
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t disjukr/bdlc:1.2.3 \
  -t disjukr/bdlc:latest \
  --push .
```
