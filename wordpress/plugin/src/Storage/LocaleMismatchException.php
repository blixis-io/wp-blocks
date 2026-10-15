<?php
/**
 * A content stream was written with another locale's identity.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Thrown when a content envelope names a locale other than the stream it is written to. */
final class LocaleMismatchException extends \InvalidArgumentException {}
