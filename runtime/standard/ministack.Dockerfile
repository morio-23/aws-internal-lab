FROM ministackorg/ministack:1.5.22

USER root
COPY runtime/standard/ministack_overlay.py /opt/ministack/ministack_overlay.py
RUN chown ministack:ministack /opt/ministack/ministack_overlay.py
USER ministack

ENTRYPOINT ["python", "/opt/ministack/ministack_overlay.py"]
