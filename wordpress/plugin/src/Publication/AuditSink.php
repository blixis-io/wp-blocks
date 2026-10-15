<?php
/**
 * Audit hook boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Publication;

\defined( 'ABSPATH' ) || exit;

/** Emits successful publication events. */
interface AuditSink {
	/** Emit a safe event.
	 *
	 * @param AuditEvent $event Safe event.
	 */
	public function emit( AuditEvent $event ): void;
}
