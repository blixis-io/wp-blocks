<?php
/**
 * WordPress publication audit hook.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** Sends the immutable event to WordPress observers. */
final class WordPressAuditSink implements AuditSink {
	/** Emit through the WordPress action hook.
	 *
	 * @param AuditEvent $event Safe event.
	 */
	public function emit( AuditEvent $event ): void {
		\do_action( 'blixis_builder_publication_event', $event->data() );
	}
}
