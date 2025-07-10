# elasticsearch/Dockerfile
FROM docker.elastic.co/elasticsearch/elasticsearch:8.9.2

# copy your config
COPY config/elasticsearch.yml /usr/share/elasticsearch/config/

# install plugin example
# RUN elasticsearch-plugin install analysis-icu

# (you can COPY scripts into /usr/share/elasticsearch/scripts or similar)
