<?php
/**
 * Blixis theme bootstrap.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

\defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/src/Compat.php';
require_once __DIR__ . '/src/Setup.php';
require_once __DIR__ . '/src/SetupState.php';
require_once __DIR__ . '/src/SetupAdmin.php';

Setup::register();
