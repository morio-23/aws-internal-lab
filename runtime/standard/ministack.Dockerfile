FROM ministackorg/ministack:1.5.22

USER root
COPY runtime/standard/ministack_overlay.py /opt/ministack/ministack_overlay.py
COPY runtime/standard/ministack-entrypoint.sh /opt/ministack/ministack-entrypoint.sh
RUN chown ministack:ministack /opt/ministack/ministack_overlay.py
RUN chmod 755 /opt/ministack/ministack-entrypoint.sh

ENTRYPOINT ["/opt/ministack/ministack-entrypoint.sh"]
